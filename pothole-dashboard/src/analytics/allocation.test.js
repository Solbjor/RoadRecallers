/**
 * Unit tests for allocation.js
 * 
 * Run with: npm test (if vitest is configured)
 * Or: node --test src/analytics/allocation.test.js (Node 18+)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeRecencyWeight,
  computeClusterWeight,
  computeReportScore,
  buildCantonPriority,
  flattenPriorityTable,
} from './allocation.js';

describe('computeRecencyWeight', () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('should return 1.20 for reports <= 1 day old', () => {
    const recent = now - 0.5 * DAY_MS; // 12 hours ago
    expect(computeRecencyWeight(recent, now)).toBe(1.20);
  });

  it('should return 1.00 for reports 1-3 days old', () => {
    const twoDaysAgo = now - 2 * DAY_MS;
    expect(computeRecencyWeight(twoDaysAgo, now)).toBe(1.00);
  });

  it('should return 0.85 for reports 3-7 days old', () => {
    const fiveDaysAgo = now - 5 * DAY_MS;
    expect(computeRecencyWeight(fiveDaysAgo, now)).toBe(0.85);
  });

  it('should return 0.70 for reports > 7 days old', () => {
    const tenDaysAgo = now - 10 * DAY_MS;
    expect(computeRecencyWeight(tenDaysAgo, now)).toBe(0.70);
  });

  it('should handle boundary at exactly 1 day', () => {
    const exactlyOneDay = now - DAY_MS;
    expect(computeRecencyWeight(exactlyOneDay, now)).toBe(1.20);
  });

  it('should handle boundary at exactly 3 days', () => {
    const exactlyThreeDays = now - 3 * DAY_MS;
    expect(computeRecencyWeight(exactlyThreeDays, now)).toBe(1.00);
  });

  it('should handle boundary at exactly 7 days', () => {
    const exactlySevenDays = now - 7 * DAY_MS;
    expect(computeRecencyWeight(exactlySevenDays, now)).toBe(0.85);
  });

  it('should return 1.0 for invalid dates', () => {
    expect(computeRecencyWeight(null, now)).toBe(1.0);
    expect(computeRecencyWeight(undefined, now)).toBe(1.0);
    expect(computeRecencyWeight('invalid', now)).toBe(1.0);
  });

  it('should accept ISO string dates', () => {
    const isoDate = new Date(now - 2 * DAY_MS).toISOString();
    expect(computeRecencyWeight(isoDate, now)).toBe(1.00);
  });

  it('should accept epoch milliseconds', () => {
    const epochMs = now - 0.5 * DAY_MS;
    expect(computeRecencyWeight(epochMs, now)).toBe(1.20);
  });
});

describe('computeClusterWeight', () => {
  const baseReport = {
    id: 'r1',
    lat: 9.9281,
    lng: -84.0907,
  };

  it('should return 1.0 when no neighbors', () => {
    const reports = [baseReport];
    const weight = computeClusterWeight(baseReport, reports);
    expect(weight).toBe(1.0);
  });

  it('should increase weight with neighbors within radius', () => {
    const reports = [
      baseReport,
      { id: 'r2', lat: 9.9285, lng: -84.0910 }, // ~50m away
      { id: 'r3', lat: 9.9290, lng: -84.0915 }, // ~100m away
    ];
    
    const weight = computeClusterWeight(baseReport, reports, 750);
    expect(weight).toBeGreaterThan(1.0);
    expect(weight).toBe(1 + 2 * 0.08); // 2 neighbors
  });

  it('should cap at maxBoostCount', () => {
    const reports = [
      baseReport,
      { id: 'r2', lat: 9.9285, lng: -84.0910 },
      { id: 'r3', lat: 9.9286, lng: -84.0911 },
      { id: 'r4', lat: 9.9287, lng: -84.0912 },
      { id: 'r5', lat: 9.9288, lng: -84.0913 },
      { id: 'r6', lat: 9.9289, lng: -84.0914 },
      { id: 'r7', lat: 9.9290, lng: -84.0915 },
      { id: 'r8', lat: 9.9291, lng: -84.0916 },
    ];
    
    const weight = computeClusterWeight(baseReport, reports, 750, 5);
    expect(weight).toBe(1 + 5 * 0.08); // Capped at 5 neighbors
  });

  it('should not count reports outside radius', () => {
    const reports = [
      baseReport,
      { id: 'r2', lat: 10.0, lng: -84.5 }, // Far away
    ];
    
    const weight = computeClusterWeight(baseReport, reports, 750);
    expect(weight).toBe(1.0);
  });

  it('should not count itself', () => {
    const reports = [baseReport, baseReport]; // Duplicate
    const weight = computeClusterWeight(baseReport, reports);
    expect(weight).toBe(1.0);
  });

  it('should handle missing coordinates', () => {
    const invalidReport = { id: 'r1', lat: null, lng: null };
    const weight = computeClusterWeight(invalidReport, [invalidReport]);
    expect(weight).toBe(1.0);
  });
});

describe('computeReportScore', () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const baseReport = {
    id: 'r1',
    lat: 9.9281,
    lng: -84.0907,
    severity: 0.8,
    pothole_confidence: 0.9,
    createdAt: now - 0.5 * DAY_MS, // Recent
  };

  it('should compute score correctly', () => {
    const reports = [baseReport];
    const { breakdown } = computeReportScore(baseReport, reports, now);
    
    expect(breakdown.severity).toBe(0.8);
    expect(breakdown.confidence).toBe(0.9);
    expect(breakdown.recencyWeight).toBe(1.20);
    expect(breakdown.clusterWeight).toBe(1.0); // No neighbors
    expect(breakdown.score).toBe(0.8 * 0.9 * 1.20 * 1.0);
    expect(breakdown.flags).toEqual([]);
  });

  it('should handle missing severity with flag', () => {
    const report = { ...baseReport, severity: null };
    const { breakdown } = computeReportScore(report, [report], now);
    
    expect(breakdown.severity).toBe(0.5); // Default
    expect(breakdown.flags).toContain('severity_missing');
  });

  it('should handle missing confidence with flag', () => {
    const report = { ...baseReport, pothole_confidence: undefined };
    const { breakdown } = computeReportScore(report, [report], now);
    
    expect(breakdown.confidence).toBe(0.5); // Default
    expect(breakdown.flags).toContain('confidence_missing');
  });

  it('should clamp values to [0, 1]', () => {
    const report = {
      ...baseReport,
      severity: 1.5, // Out of range
      pothole_confidence: -0.2, // Out of range
    };
    
    const { breakdown } = computeReportScore(report, [report], now);
    
    expect(breakdown.severity).toBe(1.0);
    expect(breakdown.confidence).toBe(0.0);
  });

  it('should increase score with clustering', () => {
    const reports = [
      baseReport,
      { id: 'r2', lat: 9.9285, lng: -84.0910, severity: 0.5, pothole_confidence: 0.5 },
      { id: 'r3', lat: 9.9290, lng: -84.0915, severity: 0.5, pothole_confidence: 0.5 },
    ];
    
    const { breakdown } = computeReportScore(baseReport, reports, now);
    
    expect(breakdown.clusterWeight).toBeGreaterThan(1.0);
    expect(breakdown.score).toBeGreaterThan(0.8 * 0.9 * 1.20 * 1.0);
  });
});

describe('buildCantonPriority', () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let reports;

  beforeEach(() => {
    reports = [
      {
        id: 'r1',
        lat: 9.9281,
        lng: -84.0907,
        severity: 0.8,
        pothole_confidence: 0.9,
        createdAt: now - 0.5 * DAY_MS,
        geo: { province: 'San José', canton: 'Central' },
      },
      {
        id: 'r2',
        lat: 9.9285,
        lng: -84.0910,
        severity: 0.7,
        pothole_confidence: 0.85,
        createdAt: now - 1.5 * DAY_MS,
        geo: { province: 'San José', canton: 'Central' },
      },
      {
        id: 'r3',
        lat: 10.0,
        lng: -84.5,
        severity: 0.6,
        pothole_confidence: 0.75,
        createdAt: now - 3 * DAY_MS,
        geo: { province: 'Alajuela', canton: 'Central' },
      },
    ];
  });

  it('should group by province and canton', () => {
    const grouped = buildCantonPriority(reports, now);
    
    expect(grouped).toHaveProperty('San José');
    expect(grouped).toHaveProperty('Alajuela');
    expect(grouped['San José']).toHaveLength(1);
    expect(grouped['Alajuela']).toHaveLength(1);
  });

  it('should calculate reportCount correctly', () => {
    const grouped = buildCantonPriority(reports, now);
    
    const sjCentral = grouped['San José'][0];
    expect(sjCentral.reportCount).toBe(2);
    
    const alCentral = grouped['Alajuela'][0];
    expect(alCentral.reportCount).toBe(1);
  });

  it('should calculate totalPriority as sum of scores', () => {
    const grouped = buildCantonPriority(reports, now);
    
    const sjCentral = grouped['San José'][0];
    expect(sjCentral.totalPriority).toBeGreaterThan(0);
    
    // Verify it's sum of individual scores
    const score1 = computeReportScore(reports[0], reports, now).breakdown.score;
    const score2 = computeReportScore(reports[1], reports, now).breakdown.score;
    expect(sjCentral.totalPriority).toBeCloseTo(score1 + score2, 5);
  });

  it('should sort cantons by totalPriority desc within province', () => {
    const moreReports = [
      ...reports,
      {
        id: 'r4',
        lat: 9.85,
        lng: -84.1,
        severity: 0.9,
        pothole_confidence: 0.95,
        createdAt: now - 0.2 * DAY_MS,
        geo: { province: 'San José', canton: 'Escazú' },
      },
      {
        id: 'r5',
        lat: 9.86,
        lng: -84.11,
        severity: 0.95,
        pothole_confidence: 0.98,
        createdAt: now - 0.1 * DAY_MS,
        geo: { province: 'San José', canton: 'Escazú' },
      },
    ];
    
    const grouped = buildCantonPriority(moreReports, now);
    const sjCantons = grouped['San José'];
    
    expect(sjCantons[0].totalPriority).toBeGreaterThanOrEqual(sjCantons[1].totalPriority);
  });

  it('should handle unknown province/canton', () => {
    const noGeoReport = {
      id: 'r4',
      lat: 9.5,
      lng: -84.2,
      severity: 0.5,
      pothole_confidence: 0.6,
      createdAt: now,
    };
    
    const grouped = buildCantonPriority([noGeoReport], now);
    
    expect(grouped).toHaveProperty('Unknown Province');
    expect(grouped['Unknown Province'][0].canton).toBe('Unknown Canton');
  });

  it('should calculate topHotspotCenter as mean lat/lng', () => {
    const grouped = buildCantonPriority(reports, now);
    const sjCentral = grouped['San José'][0];
    
    const expectedLat = (reports[0].lat + reports[1].lat) / 2;
    const expectedLng = (reports[0].lng + reports[1].lng) / 2;
    
    expect(sjCentral.topHotspotCenter.lat).toBeCloseTo(expectedLat, 5);
    expect(sjCentral.topHotspotCenter.lng).toBeCloseTo(expectedLng, 5);
  });

  it('should track most recent report timestamp', () => {
    const grouped = buildCantonPriority(reports, now);
    const sjCentral = grouped['San José'][0];
    
    // Most recent should be r1 (0.5 days ago)
    expect(sjCentral.topRecentAt).toBeGreaterThan(0);
    expect(sjCentral.topRecentAt).toBe(reports[0].createdAt);
  });
});

describe('flattenPriorityTable', () => {
  const now = Date.now();

  it('should flatten to single array', () => {
    const grouped = {
      'San José': [
        { province: 'San José', canton: 'Central', totalPriority: 5.0, reportCount: 3 },
        { province: 'San José', canton: 'Escazú', totalPriority: 8.0, reportCount: 5 },
      ],
      'Alajuela': [
        { province: 'Alajuela', canton: 'Central', totalPriority: 6.5, reportCount: 4 },
      ],
    };
    
    const flat = flattenPriorityTable(grouped);
    
    expect(flat).toHaveLength(3);
    expect(flat[0].canton).toBe('Escazú'); // Highest priority
    expect(flat[1].canton).toBe('Central'); // Alajuela Central
    expect(flat[2].canton).toBe('Central'); // San José Central
  });

  it('should sort by totalPriority descending', () => {
    const grouped = {
      'Province A': [
        { province: 'Province A', canton: 'Low', totalPriority: 2.0 },
        { province: 'Province A', canton: 'High', totalPriority: 10.0 },
      ],
      'Province B': [
        { province: 'Province B', canton: 'Medium', totalPriority: 5.0 },
      ],
    };
    
    const flat = flattenPriorityTable(grouped);
    
    expect(flat[0].totalPriority).toBe(10.0);
    expect(flat[1].totalPriority).toBe(5.0);
    expect(flat[2].totalPriority).toBe(2.0);
  });

  it('should handle empty input', () => {
    const flat = flattenPriorityTable({});
    expect(flat).toEqual([]);
  });
});
