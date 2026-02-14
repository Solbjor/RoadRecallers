# Pothole Detection Backend - Setup & Testing Guide

## Installation

```bash
cd backend
pip install -r requirements.txt
```

## Running the Server

```bash
# Method 1: Using the app directly
python app.py

# Method 2: Using uvicorn (recommended for production)
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The server will start at `http://localhost:8000`

## API Endpoints

### 1. Health Check
```bash
curl http://localhost:8000/health
```

### 2. Root
```bash
curl http://localhost:8000/
```

### 3. Analyze Image
```bash
curl -X POST "http://localhost:8000/analyze" \
  -F "file=@path/to/image.jpg"
```

## Loading Your Trained Model

Once you have trained weights from Kaggle, update line 18 in `app.py`:

```python
# Option 1: Load .h5 file
detector = PotholeDetector(weights_path="models/pothole_resnet50.h5")

# Option 2: Load SavedModel directory
detector = PotholeDetector(weights_path="models/pothole_model/")
```

## Model Architecture

Matches your Kaggle notebook:
- **Base**: ResNet50 (include_top=False, ImageNet weights)
- **Head**: 
  - GlobalAveragePooling2D
  - Dense(128, relu)
  - Dropout(0.5)
  - Dense(1, sigmoid)

## Preprocessing

Exactly matches training:
- Resize to 224x224
- Convert to float32
- Rescale by 1./255

## Response Format

```json
{
  "pothole_detected": true,
  "pothole_confidence": 0.87
}
```

Class mapping: `normal=0`, `potholes=1`
