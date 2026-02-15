/**
 * Demo script for resource allocation model
 * Generates synthetic dataset and demonstrates prioritization
 * 
 * Run with: node scripts/demo_allocation.js
 */

import {
  computeReportScore,
  buildCantonPriority,
  flattenPriorityTable,
} from '../src/analytics/allocation.js';

// ============================================
// SYNTHETIC DATA GENERATION
// ============================================

const PROVINCES = ['San José', 'Alajuela', 'Cartago'];
const CANTONS = {
  'San José': ['Central', 'Escazú', 'Desamparados', 'Mora'],
  'Alajuela': ['Central', 'San Ramón', 'Grecia'],
  'Cartago': ['Central', 'La Unión', 'Paraíso'],
};

// Base coordinates for Costa Rica (approximate province centers)
const PROVINCE_COORDS = {
  'San José': { lat: 9.9281, lng: -84.0907 },
  'Alajuela': { lat: 10.0162, lng: -84.2119 },
  'Cartago': { lat: 9.8626, lng: -83.9195 },
};

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function generateReport(id, province, canton, options = {}) {
  const baseCoord = PROVINCE_COORDS[province];
  
  // Add variation for canton (small offset)
  const latOffset = randomInRange(-0.05, 0.05);
  const lngOffset = randomInRange(-0.05, 0.05);
  
  // If part of hotspot, cluster tightly
  const isHotspot = options.hotspot || false;
  const clusterLat = options.clusterLat || baseCoord.lat;
  const clusterLng = options.clusterLng || baseCoord.lng;
  
  const lat = isHotspot
    ? clusterLat + randomInRange(-0.002, 0.002) // ~200m radius
    : baseCoord.lat + latOffset;
    
  const lng = isHotspot
    ? clusterLng + randomInRange(-0.002, 0.002)
    : baseCoord.lng + lngOffset;
  
  // Random severity and confidence
  const severity = options.severity || randomInRange(0.3, 0.95);
  const confidence = options.confidence || randomInRange(0.6, 0.98);
  
  // Age distribution: mix of old and new
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  
  let ageMs;
  if (options.age === 'recent') {
    ageMs = randomInRange(0, 1 * DAY_MS);
  } else if (options.age === 'old') {
    ageMs = randomInRange(7 * DAY_MS, 30 * DAY_MS);
  } else {
    ageMs = randomInRange(0, 10 * DAY_MS);
  }
  
  const createdAt = now - ageMs;
  
  return {
    id: `report_${id}`,
    lat,
    lng,
    severity,
    pothole_confidence: confidence,
    createdAt,
    geo: {
      province,
      canton,
    },
  };
}

function generateSyntheticDataset() {
  const reports = [];
  let idCounter = 1;
  
  // Generate base reports across all provinces/cantons
  for (const province in CANTONS) {
    const cantonList = CANTONS[province];
    
    for (const canton of cantonList) {
      const count = Math.floor(randomInRange(3, 8));
      
      for (let i = 0; i < count; i++) {
        reports.push(generateReport(idCounter++, province, canton));
      }
    }
  }
  
  // Create a concentrated hotspot in San José Central
  // High severity, recent reports, clustered
  const hotspotCenter = { lat: 9.9281, lng: -84.0907 };
  
  for (let i = 0; i < 15; i++) {
    reports.push(
      generateReport(idCounter++, 'San José', 'Central', {
        hotspot: true,
        clusterLat: hotspotCenter.lat,
        clusterLng: hotspotCenter.lng,
        severity: randomInRange(0.7, 0.95),
        confidence: randomInRange(0.8, 0.98),
        age: 'recent',
      })
    );
  }
  
  // Add some old reports to various cantons
  for (let i = 0; i < 5; i++) {
    const province = PROVINCES[Math.floor(Math.random() * PROVINCES.length)];
    const cantonList = CANTONS[province];
    const canton = cantonList[Math.floor(Math.random() * cantonList.length)];
    
    reports.push(
      generateReport(idCounter++, province, canton, {
        age: 'old',
        severity: randomInRange(0.4, 0.6),
      })
    );
  }
  
  return reports;
}

// ============================================
// DEMO EXECUTION
// ============================================

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toISOString().split('T')[0];
}

function runDemo() {
  console.log('='.repeat(60));
  console.log('MOPT RESOURCE ALLOCATION MODEL - DEMO');
  console.log('='.repeat(60));
  console.log();
  
  // Generate synthetic data
  console.log('📊 Generating synthetic dataset...');
  const reports = generateSyntheticDataset();
  console.log(`   Generated ${reports.length} reports`);
  console.log();
  
  // Build canton priority
  const now = Date.now();
  console.log('🔄 Computing prioritization...');
  const grouped = buildCantonPriority(reports, now);
  const flat = flattenPriorityTable(grouped);
  console.log(`   Processed ${flat.length} cantons`);
  console.log();
  
  // Display top 10 cantons
  console.log('📈 TOP 10 CANTONS BY PRIORITY');
  console.log('-'.repeat(60));
  console.log(
    'Rank'.padEnd(6) +
    'Province'.padEnd(15) +
    'Canton'.padEnd(15) +
    'Priority'.padEnd(12) +
    'Reports'
  );
  console.log('-'.repeat(60));
  
  for (let i = 0; i < Math.min(10, flat.length); i++) {
    const canton = flat[i];
    console.log(
      `${i + 1}`.padEnd(6) +
      canton.province.padEnd(15) +
      canton.canton.padEnd(15) +
      canton.totalPriority.toFixed(2).padEnd(12) +
      canton.reportCount
    );
  }
  console.log();
  
  // Detailed view of #1 canton
  if (flat.length > 0) {
    const topCanton = flat[0];
    console.log('🏆 #1 CANTON DETAILS');
    console.log('-'.repeat(60));
    console.log(`Province:              ${topCanton.province}`);
    console.log(`Canton:                ${topCanton.canton}`);
    console.log(`Total Priority:        ${topCanton.totalPriority.toFixed(2)}`);
    console.log(`Report Count:          ${topCanton.reportCount}`);
    console.log(`Avg Severity (wtd):    ${topCanton.avgSeverityWeighted.toFixed(3)}`);
    console.log(`Avg Confidence:        ${topCanton.avgConfidence.toFixed(3)}`);
    console.log(`Most Recent Report:    ${formatDate(topCanton.topRecentAt)}`);
    
    if (topCanton.topHotspotCenter) {
      console.log(
        `Hotspot Center:        ${topCanton.topHotspotCenter.lat.toFixed(4)}, ${topCanton.topHotspotCenter.lng.toFixed(4)}`
      );
    }
    console.log();
  }
  
  // Show example report score breakdowns
  console.log('🔍 EXAMPLE REPORT SCORE BREAKDOWNS');
  console.log('-'.repeat(60));
  
  // Find a report in hotspot (San José Central)
  const hotspotReport = reports.find(
    (r) => r.geo.province === 'San José' && r.geo.canton === 'Central'
  );
  
  if (hotspotReport) {
    const { breakdown } = computeReportScore(hotspotReport, reports, now);
    
    console.log('Report A (Hotspot - San José Central):');
    console.log(`  ID:               ${hotspotReport.id}`);
    console.log(`  Severity:         ${breakdown.severity.toFixed(3)}`);
    console.log(`  Confidence:       ${breakdown.confidence.toFixed(3)}`);
    console.log(`  Recency Weight:   ${breakdown.recencyWeight.toFixed(3)}`);
    console.log(`  Cluster Weight:   ${breakdown.clusterWeight.toFixed(3)}`);
    console.log(`  FINAL SCORE:      ${breakdown.score.toFixed(3)}`);
    
    if (breakdown.flags.length > 0) {
      console.log(`  Flags:            ${breakdown.flags.join(', ')}`);
    }
    console.log();
  }
  
  // Find an isolated report
  const isolatedReport = reports.find(
    (r) => r.geo.province === 'Cartago' && r.geo.canton === 'Paraíso'
  );
  
  if (isolatedReport) {
    const { breakdown } = computeReportScore(isolatedReport, reports, now);
    
    console.log('Report B (Isolated - Cartago Paraíso):');
    console.log(`  ID:               ${isolatedReport.id}`);
    console.log(`  Severity:         ${breakdown.severity.toFixed(3)}`);
    console.log(`  Confidence:       ${breakdown.confidence.toFixed(3)}`);
    console.log(`  Recency Weight:   ${breakdown.recencyWeight.toFixed(3)}`);
    console.log(`  Cluster Weight:   ${breakdown.clusterWeight.toFixed(3)}`);
    console.log(`  FINAL SCORE:      ${breakdown.score.toFixed(3)}`);
    
    if (breakdown.flags.length > 0) {
      console.log(`  Flags:            ${breakdown.flags.join(', ')}`);
    }
    console.log();
  }
  
  console.log('='.repeat(60));
  console.log('✅ Demo complete!');
  console.log();
  console.log('Key takeaways:');
  console.log('- Hotspot reports (San José Central) get cluster boost');
  console.log('- Recent reports get recency boost');
  console.log('- High severity + confidence = higher priority');
  console.log('- Canton aggregation enables strategic resource allocation');
  console.log('='.repeat(60));
}

// Run demo
runDemo();
