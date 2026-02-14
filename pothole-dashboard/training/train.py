"""
Pothole Detection Training Script - PyTorch
Binary classification using ResNet50 transfer learning
"""

import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms, models
from pathlib import Path


# ========================================
# Configuration
# ========================================

DATA_DIR = "data"  # data/normal/ and data/potholes/
IMG_SIZE = 224
BATCH_SIZE = 32
VALIDATION_SPLIT = 0.2
INITIAL_EPOCHS = 10
FINETUNE_EPOCHS = 3
INITIAL_LR = 1e-4
FINETUNE_LR = 1e-5
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
RANDOM_SEED = 42


# ========================================
# Model Definition
# ========================================

class PotholeClassifier(nn.Module):
    """
    ResNet50-based binary classifier.
    Architecture matches Kaggle Keras version.
    """
    def __init__(self):
        super().__init__()
        
        # Load pretrained ResNet50
        resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
        
        # Get number of features
        num_features = resnet.fc.in_features  # 2048
        
        # Replace final fc with custom head
        resnet.fc = nn.Sequential(
            nn.Linear(num_features, 128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, 1),
            nn.Sigmoid()
        )
        
        self.model = resnet
    
    def forward(self, x):
        return self.model(x)
    
    def freeze_backbone(self):
        """Freeze all layers except final fc."""
        for param in self.model.parameters():
            param.requires_grad = False
        
        # Unfreeze only the custom head
        for param in self.model.fc.parameters():
            param.requires_grad = True
    
    def unfreeze_last_layers(self, n=30):
        """Unfreeze last n layers for fine-tuning."""
        layers = list(self.model.children())
        
        # Freeze all first
        for param in self.model.parameters():
            param.requires_grad = False
        
        # Unfreeze last n layers (including fc)
        for layer in layers[-n:]:
            for param in layer.parameters():
                param.requires_grad = True


# ========================================
# Data Preparation
# ========================================

def get_transforms(augment=True):
    """
    Get transforms matching Kaggle Keras preprocessing.
    
    CRITICAL: NO ImageNet normalization - just resize and scale to [0,1]
    This matches Keras ImageDataGenerator with rescale=1./255
    """
    if augment:
        return transforms.Compose([
            transforms.Resize((IMG_SIZE, IMG_SIZE)),
            transforms.RandomRotation(20),
            transforms.RandomHorizontalFlip(),
            transforms.RandomAffine(degrees=0, translate=(0.2, 0.2)),
            transforms.ToTensor(),  # Converts to [0, 1]
            # NO Normalize! Keep it as [0, 1] to match Keras
        ])
    else:
        return transforms.Compose([
            transforms.Resize((IMG_SIZE, IMG_SIZE)),
            transforms.ToTensor(),  # Converts to [0, 1]
        ])


def prepare_data():
    """Create train and validation data loaders."""
    print("\nPreparing data...")
    
    # Load dataset with training transforms
    train_transform = get_transforms(augment=True)
    full_dataset = datasets.ImageFolder(DATA_DIR, transform=train_transform)
    
    # Print class mapping
    print(f"\nClass mapping: {full_dataset.class_to_idx}")
    print("Expected: {{'normal': 0, 'potholes': 1}}")
    
    # Split into train and validation
    total_size = len(full_dataset)
    val_size = int(total_size * VALIDATION_SPLIT)
    train_size = total_size - val_size
    
    train_dataset, val_dataset = random_split(
        full_dataset,
        [train_size, val_size],
        generator=torch.Generator().manual_seed(RANDOM_SEED)
    )
    
    # Apply validation transform to val set
    val_transform = get_transforms(augment=False)
    val_dataset.dataset.transform = val_transform
    
    # Create data loaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0,  # Windows compatibility
        pin_memory=True if torch.cuda.is_available() else False
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
        pin_memory=True if torch.cuda.is_available() else False
    )
    
    print(f"Training samples: {train_size}")
    print(f"Validation samples: {val_size}")
    print(f"Device: {DEVICE}")
    
    return train_loader, val_loader


# ========================================
# Training Functions
# ========================================

def train_epoch(model, loader, criterion, optimizer):
    """Train for one epoch."""
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    
    for inputs, labels in loader:
        inputs = inputs.to(DEVICE)
        labels = labels.to(DEVICE).float().unsqueeze(1)
        
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item()
        predicted = (outputs > 0.5).float()
        correct += (predicted == labels).sum().item()
        total += labels.size(0)
    
    avg_loss = running_loss / len(loader)
    accuracy = 100 * correct / total
    
    return avg_loss, accuracy


def validate(model, loader, criterion):
    """Validate the model."""
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0
    
    with torch.no_grad():
        for inputs, labels in loader:
            inputs = inputs.to(DEVICE)
            labels = labels.to(DEVICE).float().unsqueeze(1)
            
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            
            running_loss += loss.item()
            predicted = (outputs > 0.5).float()
            correct += (predicted == labels).sum().item()
            total += labels.size(0)
    
    avg_loss = running_loss / len(loader)
    accuracy = 100 * correct / total
    
    return avg_loss, accuracy


# ========================================
# Training Pipeline
# ========================================

def train_initial(model, train_loader, val_loader):
    """Phase 1: Train with frozen backbone."""
    print("\n" + "="*50)
    print("PHASE 1: Initial Training (frozen backbone)")
    print("="*50)
    
    model.freeze_backbone()
    
    criterion = nn.BCELoss()  # Binary Cross Entropy (model has sigmoid)
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=INITIAL_LR
    )
    
    best_val_loss = float('inf')
    patience = 3
    patience_counter = 0
    
    for epoch in range(INITIAL_EPOCHS):
        print(f"\nEpoch {epoch+1}/{INITIAL_EPOCHS}")
        
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer)
        val_loss, val_acc = validate(model, val_loader, criterion)
        
        print(f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.2f}%")
        print(f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.2f}%")
        
        # Save best model
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), 'pothole_detector_best.pth')
            print("✓ Saved best model")
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping (patience={patience})")
                break
    
    # Save final model
    torch.save(model.state_dict(), 'pothole_detector_final.pth')
    print("\n✓ Saved: pothole_detector_final.pth")
    print("✓ Saved: pothole_detector_best.pth")


def finetune(model, train_loader, val_loader):
    """Phase 2: Fine-tune with unfrozen layers."""
    print("\n" + "="*50)
    print("PHASE 2: Fine-tuning (unfreezing last 30 layers)")
    print("="*50)
    
    model.unfreeze_last_layers(30)
    
    criterion = nn.BCELoss()
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=FINETUNE_LR
    )
    
    best_val_loss = float('inf')
    
    for epoch in range(FINETUNE_EPOCHS):
        print(f"\nEpoch {epoch+1}/{FINETUNE_EPOCHS}")
        
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer)
        val_loss, val_acc = validate(model, val_loader, criterion)
        
        print(f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.2f}%")
        print(f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.2f}%")
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), 'pothole_detector_finetuned.pth')
            print("✓ Saved finetuned model")
    
    print("\n✓ Saved: pothole_detector_finetuned.pth")


# ========================================
# Main
# ========================================

def main():
    """Main training pipeline."""
    print("="*50)
    print("Pothole Detection Training (PyTorch)")
    print("="*50)
    
    # Check data directory
    if not os.path.exists(DATA_DIR):
        print(f"\n❌ ERROR: '{DATA_DIR}' directory not found!")
        print(f"Expected structure:")
        print(f"  {DATA_DIR}/")
        print(f"    normal/")
        print(f"    potholes/")
        return
    
    # Prepare data
    train_loader, val_loader = prepare_data()
    
    # Build model
    print("\nBuilding model...")
    model = PotholeClassifier().to(DEVICE)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Total parameters: {total_params:,}")
    
    # Phase 1: Initial training
    train_initial(model, train_loader, val_loader)
    
    # Phase 2: Fine-tuning
    try:
        finetune(model, train_loader, val_loader)
    except Exception as e:
        print(f"\n⚠ Fine-tuning skipped: {e}")
    
    print("\n" + "="*50)
    print("✓ Training Complete!")
    print("="*50)
    print("\nSaved models:")
    print("  - pothole_detector_best.pth")
    print("  - pothole_detector_final.pth")
    print("  - pothole_detector_finetuned.pth")
    print("\nTo use in backend:")
    print("  Update backend/app.py line 26:")
    print('  detector = PotholeDetector(weights_path="pothole_detector_finetuned.pth")')


if __name__ == "__main__":
    main()


"""
========================================
USAGE
========================================

1. Prepare dataset:
   data/
     normal/      <- Normal road images
     potholes/    <- Pothole images

2. Install dependencies:
   pip install -r requirements.txt

3. Run training:
   python train.py

4. Models will be saved as .pth files in current directory

5. Copy best model to backend:
   copy pothole_detector_finetuned.pth ../backend/

6. Update backend/app.py to load the weights

========================================
"""
