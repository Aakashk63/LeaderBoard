/**
 * Storage and Score Management Module
 * Handles persistence, calculations, ranking, ties, and exports
 */

import { INITIAL_STUDENTS, SCORING_CATEGORIES, TOTAL_MAX_POINTS, generatePilotSampleScores } from './initialData.js';

const STORAGE_KEY_RECORDS = 'STUDENT_LEADERBOARD_RECORDS_V1';
const STORAGE_KEY_CONFIG = 'STUDENT_LEADERBOARD_CONFIG_V1';

export class LeaderboardStore {
  constructor() {
    this.students = [...INITIAL_STUDENTS];
    this.categories = [...SCORING_CATEGORIES];
    this.totalMaxPoints = TOTAL_MAX_POINTS;
    this.records = this.loadRecords();
  }

  loadRecords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading records from localStorage:', e);
    }
    // Default to clean empty state (all students at 0 points) as required by specification
    return [];
  }

  saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(this.records));
    } catch (e) {
      console.error('Error saving records to localStorage:', e);
    }
  }

  /**
   * Retrieves all students
   */
  getStudents() {
    return this.students;
  }

  /**
   * Retrieves all categories
   */
  getCategories() {
    return this.categories;
  }

  /**
   * Gets a specific student by ID
   */
  getStudentById(id) {
    return this.students.find(s => s.id === id);
  }

  /**
   * Gets a category by ID
   */
  getCategoryById(id) {
    return this.categories.find(c => c.id === id);
  }

  /**
   * Gets all raw scoring records
   */
  getAllRecords() {
    return [...this.records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Finds an existing record for a student and category
   */
  findRecord(studentId, categoryId) {
    return this.records.find(r => r.studentId === studentId && r.categoryId === categoryId);
  }

  /**
   * Calculates comprehensive student standings including scores, ranks, ties, and history
   */
  getLeaderboardData() {
    // 1. Build student score map
    const studentMap = {};

    this.students.forEach(student => {
      studentMap[student.id] = {
        id: student.id,
        name: student.name,
        categoryScores: {},
        categoryRemarks: {},
        totalPoints: 0,
        percentage: 0,
        remainingPoints: this.totalMaxPoints,
        history: [],
        rank: 1,
        isTied: false
      };

      // Initialize all categories with 0
      this.categories.forEach(cat => {
        studentMap[student.id].categoryScores[cat.id] = 0;
        studentMap[student.id].categoryRemarks[cat.id] = '';
      });
    });

    // 2. Populate scores from records
    this.records.forEach(record => {
      const studentData = studentMap[record.studentId];
      if (studentData) {
        studentData.categoryScores[record.categoryId] = Number(record.awardedPoints) || 0;
        studentData.categoryRemarks[record.categoryId] = record.remarks || '';
        studentData.history.push({ ...record });
      }
    });

    // 3. Compute totals and percentages
    const leaderboardList = Object.values(studentMap).map(student => {
      let sum = 0;
      this.categories.forEach(cat => {
        sum += (student.categoryScores[cat.id] || 0);
      });
      student.totalPoints = Math.round(sum * 10) / 10; // 1 decimal precision if float
      student.percentage = Math.round((student.totalPoints / this.totalMaxPoints) * 1000) / 10;
      student.remainingPoints = Math.max(0, this.totalMaxPoints - student.totalPoints);
      
      // Sort individual history descending by date
      student.history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return student;
    });

    // 4. Sort primarily by totalPoints desc, secondarily by name asc for stable order
    leaderboardList.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.name.localeCompare(b.name);
    });

    // 5. Standard Competition Ranking (1224 ranking) with tie detection
    let currentRank = 1;
    for (let i = 0; i < leaderboardList.length; i++) {
      if (i > 0) {
        if (leaderboardList[i].totalPoints === leaderboardList[i - 1].totalPoints) {
          // Same points: same rank, both flagged as tied
          leaderboardList[i].rank = leaderboardList[i - 1].rank;
          leaderboardList[i].isTied = true;
          leaderboardList[i - 1].isTied = true;
        } else {
          // Standard competition rank skips (e.g. 1, 2, 2, 4)
          leaderboardList[i].rank = i + 1;
          leaderboardList[i].isTied = false;
        }
      } else {
        leaderboardList[i].rank = 1;
        leaderboardList[i].isTied = false;
      }
    }

    return leaderboardList;
  }

  /**
   * Save or Update a Score
   */
  saveScore({ studentId, categoryId, awardedPoints, remarks, recordId = null }) {
    const student = this.getStudentById(studentId);
    if (!student) {
      return { success: false, message: 'Selected student does not exist.' };
    }

    const category = this.getCategoryById(categoryId);
    if (!category) {
      return { success: false, message: 'Selected category does not exist.' };
    }

    const pointsNum = Number(awardedPoints);
    if (isNaN(pointsNum)) {
      return { success: false, message: 'Points must be a valid numeric value.' };
    }

    if (pointsNum < 0) {
      return { success: false, message: 'Points cannot be negative.' };
    }

    if (pointsNum > category.maxPoints) {
      return { 
        success: false, 
        message: `Entered points (${pointsNum}) exceed the maximum allowed (${category.maxPoints}) for ${category.fullName}.` 
      };
    }

    // Check if an existing record exists for this student & category
    const existingIndex = this.records.findIndex(
      r => (recordId ? r.id === recordId : (r.studentId === studentId && r.categoryId === categoryId))
    );

    const nowISO = new Date().toISOString();

    if (existingIndex >= 0) {
      // Update existing record
      this.records[existingIndex] = {
        ...this.records[existingIndex],
        studentId,
        studentName: student.name,
        categoryId,
        categoryName: category.fullName,
        maxPoints: category.maxPoints,
        awardedPoints: pointsNum,
        remarks: (remarks || '').trim(),
        timestamp: nowISO,
        updatedAt: nowISO
      };
      this.saveRecords();
      return { 
        success: true, 
        action: 'updated', 
        record: this.records[existingIndex],
        message: `Updated score for ${student.name} in "${category.fullName}" to ${pointsNum} pts.` 
      };
    } else {
      // Create new record
      const newRecord = {
        id: `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        studentId,
        studentName: student.name,
        categoryId,
        categoryName: category.fullName,
        maxPoints: category.maxPoints,
        awardedPoints: pointsNum,
        remarks: (remarks || '').trim(),
        timestamp: nowISO
      };
      this.records.push(newRecord);
      this.saveRecords();
      return { 
        success: true, 
        action: 'created', 
        record: newRecord,
        message: `Awarded ${pointsNum} pts to ${student.name} for "${category.fullName}".` 
      };
    }
  }

  /**
   * Edit existing record directly by ID (Admin)
   */
  editScore(recordId, awardedPoints, remarks) {
    const record = this.records.find(r => r.id === recordId);
    if (!record) {
      return { success: false, message: 'Scoring record not found.' };
    }

    const category = this.getCategoryById(record.categoryId);
    const pointsNum = Number(awardedPoints);

    if (isNaN(pointsNum) || pointsNum < 0) {
      return { success: false, message: 'Points must be a valid positive number.' };
    }

    if (category && pointsNum > category.maxPoints) {
      return { 
        success: false, 
        message: `Points cannot exceed category maximum of ${category.maxPoints}.` 
      };
    }

    record.awardedPoints = pointsNum;
    record.remarks = (remarks || '').trim();
    record.timestamp = new Date().toISOString();
    record.updatedAt = new Date().toISOString();

    this.saveRecords();
    return { success: true, message: 'Score updated successfully.', record };
  }

  /**
   * Delete a scoring record by ID (Admin)
   */
  deleteScore(recordId) {
    const initialLen = this.records.length;
    const target = this.records.find(r => r.id === recordId);
    this.records = this.records.filter(r => r.id !== recordId);
    
    if (this.records.length < initialLen) {
      this.saveRecords();
      return { 
        success: true, 
        message: target ? `Removed score entry for ${target.studentName} (${target.categoryName}).` : 'Score record removed.' 
      };
    }
    return { success: false, message: 'Record not found.' };
  }

  /**
   * Reset all scores to 0
   */
  resetAllScores() {
    this.records = [];
    this.saveRecords();
    return { success: true, message: 'All student scores have been successfully reset to 0.' };
  }

  /**
   * Load pilot study demo scores
   */
  loadDemoScores() {
    this.records = generatePilotSampleScores();
    this.saveRecords();
    return { success: true, message: 'Pilot study demo dataset loaded successfully.' };
  }

  /**
   * Generate Summary Statistics for Header
   */
  getStatistics() {
    const leaderboard = this.getLeaderboardData();
    const totalStudents = this.students.length;
    const totalCategories = this.categories.length;
    const maxScore = this.totalMaxPoints;

    const scores = leaderboard.map(s => s.totalPoints);
    const sum = scores.reduce((a, b) => a + b, 0);
    const avgScore = totalStudents > 0 ? (sum / totalStudents).toFixed(1) : '0.0';
    const topScore = scores.length > 0 ? Math.max(...scores) : 0;
    const scoredStudentsCount = leaderboard.filter(s => s.totalPoints > 0).length;

    return {
      totalStudents,
      totalCategories,
      maxScore,
      avgScore,
      topScore,
      scoredStudentsCount
    };
  }

  /**
   * Export Leaderboard table as CSV
   */
  exportLeaderboardCSV() {
    const leaderboard = this.getLeaderboardData();
    
    // Headers
    const headers = [
      'Rank',
      'Student Name',
      ...this.categories.map(c => `"${c.fullName} (Max ${c.maxPoints})"`),
      'Total Points',
      'Max Achievable',
      'Percentage (%)'
    ];

    const rows = leaderboard.map(student => {
      const categoryValues = this.categories.map(cat => student.categoryScores[cat.id] || 0);
      return [
        student.rank,
        `"${student.name.replace(/"/g, '""')}"`,
        ...categoryValues,
        student.totalPoints,
        this.totalMaxPoints,
        `${student.percentage}%`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    this.triggerDownload('Student_Leaderboard_Summary.csv', csvContent, 'text/csv;charset=utf-8;');
  }

  /**
   * Export Detailed Scoring Log & Category-wise Report as CSV
   */
  exportDetailedReportCSV() {
    const allRecords = this.getAllRecords();
    
    const headers = [
      'Record ID',
      'Date & Time',
      'Student Name',
      'Category',
      'Awarded Points',
      'Max Points',
      'Remarks'
    ];

    const rows = allRecords.map(r => {
      const dateFormatted = new Date(r.timestamp).toLocaleString();
      return [
        r.id,
        `"${dateFormatted}"`,
        `"${r.studentName.replace(/"/g, '""')}"`,
        `"${r.categoryName.replace(/"/g, '""')}"`,
        r.awardedPoints,
        r.maxPoints,
        `"${(r.remarks || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    this.triggerDownload('Student_Scoring_Detailed_Audit_Log.csv', csvContent, 'text/csv;charset=utf-8;');
  }

  /**
   * Utility to trigger a file download in browser
   */
  triggerDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
