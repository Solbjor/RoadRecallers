"""
Pothole Detector - PyTorch Inference Module
Binary classification for pothole detection
"""

import torch
import torch.nn as nn
from torchvision import models
from PIL import Image
import numpy as np


class PotholeDetector(nn.Module):
    """
    ResNet50-based binary pothole detector.
    
    Architecture matches Keras version:
    - Backbone: ResNet50 (pretrained on ImageNet)
    - Head: Linear(2048->128) -> ReLU -> Dropout(0.5) -> Linear(128->1) -> Sigmoid
    """
    
    def __init__(self, weights_path=None, device=None):
        super().__init__()
        
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.img_size = 224
        
        # Load pretrained ResNet50
        resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
        
        # Get number of input features to fc layer
        num_features = resnet.fc.in_features  # 2048 for ResNet50
        
        # Replace final fc layer with custom head
        resnet.fc = nn.Sequential(
            nn.Linear(num_features, 128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, 1),
            nn.Sigmoid()  # Binary classification output [0, 1]
        )
        
        self.model = resnet
        
        # Load trained weights if provided
        if weights_path:
            self.load_weights(weights_path)
        
        self.model.to(self.device)
        self.model.eval()
    
    def load_weights(self, weights_path):
        """Load model weights from checkpoint."""
        checkpoint = torch.load(weights_path, map_location=self.device)
        
        # Handle both raw state_dict and checkpoint dict
        if isinstance(checkpoint, dict) and 'state_dict' in checkpoint:
            state_dict = checkpoint['state_dict']
        else:
            state_dict = checkpoint
        
        # Remove 'model.' prefix if present (from training script)
        if any(key.startswith('model.') for key in state_dict.keys()):
            state_dict = {key.replace('model.', '', 1): value for key, value in state_dict.items()}
        
        self.model.load_state_dict(state_dict)
        print(f"✓ Loaded weights from {weights_path}")
    
    def preprocess(self, image):
        """
        Preprocess image to match training preprocessing.
        
        IMPORTANT: Must match training exactly:
        - Resize to 224x224
        - Convert to tensor (scales to 0-1)
        - NO ImageNet normalization (to match Keras rescale=1./255)
        
        Args:
            image: PIL Image
            
        Returns:
            Preprocessed tensor ready for inference
        """
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize
        image = image.resize((self.img_size, self.img_size))
        
        # Convert to numpy and scale to [0, 1]
        img_array = np.array(image, dtype=np.float32) / 255.0
        
        # Convert to tensor: (H, W, C) -> (C, H, W)
        img_tensor = torch.from_numpy(img_array).permute(2, 0, 1)
        
        # Add batch dimension
        img_tensor = img_tensor.unsqueeze(0)
        
        return img_tensor
    
    def forward(self, x):
        """Forward pass through the model."""
        return self.model(x)
    
    def predict(self, image):
        """
        Predict if image contains a pothole.
        
        Args:
            image: PIL Image
            
        Returns:
            dict with:
                - pothole_detected: bool (True if pothole)
                - pothole_confidence: float (0-1, probability of pothole)
        """
        # Preprocess image
        img_tensor = self.preprocess(image).to(self.device)
        
        # Run inference
        with torch.inference_mode():
            output = self.model(img_tensor)
            
            # Sigmoid output: probability of pothole class
            # (assuming class 1 = pothole)
            pothole_confidence = output[0][0].item()
            pothole_detected = pothole_confidence > 0.5
        
        return {
            "pothole_detected": pothole_detected,
            "pothole_confidence": pothole_confidence
        }
