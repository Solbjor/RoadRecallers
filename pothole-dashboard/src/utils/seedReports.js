// Generate clustered reports for heatmap visualization
function generateCluster(baseId, baseLat, baseLng, baseTime, regionInfo, count) {
  const reports = [];
  const titles = [
    "Deep pothole near intersection",
    "Multiple cracks + pothole cluster",
    "Road surface deterioration",
    "Large pothole blocking lane",
    "Severe cracking and settling",
    "Pothole with sharp edges",
    "Water pooling in depression",
    "Crumbling pavement edge",
    "Multiple small potholes",
    "Deep crater in roadway",
  ];
  
  const notes = [
    "Cars swerving into opposite lane. Visible water pooling.",
    "Road surface collapsing over ~15m stretch.",
    "Needs immediate attention to prevent worsening.",
    "Traffic is slowing to avoid damage.",
    "Sharp edge, likely tire damage at speed.",
    "Getting worse with each rain.",
    "Multiple reports from citizens.",
    "Hazardous during nighttime.",
    "Entire section needs repair.",
    "Base layer appears compromised.",
  ];
  
  // Select 4 random pothole images from training data (1-329)
  const availableImages = [];
  for (let img = 1; img <= 329; img++) {
    availableImages.push(img);
  }
  // Shuffle and take first 4 for this cluster
  const shuffled = availableImages.sort(() => Math.random() - 0.5);
  const selectedImages = shuffled.slice(0, Math.min(4, count));
  
  for (let i = 0; i < count; i++) {
    // Cluster points within ~100m of base point (roughly 0.001 degrees)
    const offsetLat = (Math.random() - 0.5) * 0.002;
    const offsetLng = (Math.random() - 0.5) * 0.002;
    
    // Vary time slightly (within same day)
    const minuteOffset = Math.floor(Math.random() * 480); // 0-8 hours
    const hour = baseTime.hour + Math.floor(minuteOffset / 60);
    const minute = baseTime.minute + (minuteOffset % 60);
    
    // Use actual pothole images from training data, cycle through selected 4
    const imageNum = selectedImages[i % selectedImages.length];
    
    reports.push({
      id: `cr-${String(baseId + i).padStart(3, "0")}`,
      createdAt: `2026-02-14 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      lat: baseLat + offsetLat,
      lng: baseLng + offsetLng,
      title: titles[i % titles.length],
      notes: notes[i % notes.length],
      severity: 0.4 + Math.random() * 0.5, // 0.4 to 0.9
      pothole_confidence: 0.65 + Math.random() * 0.3, // 0.65 to 0.95
      photoUrl: `/training/data/potholes/${imageNum}.jpg`,
      geo: {
        province: regionInfo.province,
        canton: regionInfo.canton,
        road: regionInfo.road,
      }
    });
  }
  
  return reports;
}

// Generate 9 regions with 5-8 clustered reports each
const region1 = generateCluster(1, 9.9333, -84.0833, { hour: 8, minute: 15 }, { province: "San José", canton: "Central", road: "Avenida Central" }, 8);
const region2 = generateCluster(20, 10.0163, -84.2116, { hour: 9, minute: 30 }, { province: "Alajuela", canton: "Alajuela", road: "Ruta 1" }, 7);
const region3 = generateCluster(40, 9.9763, -84.8384, { hour: 11, minute: 0 }, { province: "Puntarenas", canton: "Puntarenas", road: "Carretera Costanera" }, 6);
const region4 = generateCluster(60, 9.8626, -83.9152, { hour: 10, minute: 20 }, { province: "Cartago", canton: "Central", road: "Ruta 2" }, 7);
const region5 = generateCluster(80, 9.9981, -84.1170, { hour: 12, minute: 45 }, { province: "Heredia", canton: "Heredia", road: "Calle Real" }, 6);
const region6 = generateCluster(100, 10.6346, -85.4406, { hour: 14, minute: 10 }, { province: "Guanacaste", canton: "Liberia", road: "Ruta 21" }, 5);
const region7 = generateCluster(120, 10.0000, -83.0333, { hour: 13, minute: 30 }, { province: "Limón", canton: "Limón", road: "Ruta 32" }, 6);
const region8 = generateCluster(140, 9.3730, -83.7352, { hour: 15, minute: 0 }, { province: "San José", canton: "Pérez Zeledón", road: "Ruta 2" }, 7);
const region9 = generateCluster(160, 10.4302, -85.0966, { hour: 16, minute: 20 }, { province: "Guanacaste", canton: "Cañas", road: "Interamericana Norte" }, 5);

export const seedReports = [
  ...region1,
  ...region2,
  ...region3,
  ...region4,
  ...region5,
  ...region6,
  ...region7,
  ...region8,
  ...region9,
];
