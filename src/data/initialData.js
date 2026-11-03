/**
 * Initial dataset for Student Leaderboard & Points Management System
 * Pilot Study Program - Performance Tracker
 */

export const INITIAL_STUDENTS = [
  { id: 'std-1', name: 'KAVINRAJ M' },
  { id: 'std-2', name: 'Lokeshwaran M' },
  { id: 'std-3', name: 'Naveen Sushant G' },
  { id: 'std-4', name: 'Santhosh' },
  { id: 'std-5', name: 'Dharun T R' },
  { id: 'std-6', name: 'Geetan D' },
  { id: 'std-7', name: 'R parvatha varthini' },
  { id: 'std-8', name: 'GAUSHIK RAM.R' },
  { id: 'std-9', name: 'Nihal Ahmed I' },
  { id: 'std-10', name: 'SAMYUKTHA P V' },
  { id: 'std-11', name: 'V.Soniya' },
  { id: 'std-12', name: 'Hasan Mohammed' },
  { id: 'std-13', name: 'Breno' },
  { id: 'std-14', name: 'A.K.Shahana' },
  { id: 'std-15', name: 'Kabilesh' },
  { id: 'std-16', name: 'Banusri' },
  { id: 'std-17', name: 'Dharsiga' },
  { id: 'std-18', name: 'Aishwarya' },
  { id: 'std-19', name: 'John Wick' }
];

export const SCORING_CATEGORIES = [
  {
    id: 'early_bird',
    shortName: 'Early Bird',
    fullName: 'Early Bird',
    maxPoints: 20,
    icon: '🌅',
    color: '#38bdf8',
    description: 'Awarded on arrival order: 1st gets 20 pts, each subsequent gets 1 pt less (2nd: 19, 3rd: 18, etc.).'
  },
  {
    id: 'night_owl',
    shortName: 'Checkout Reward',
    fullName: 'Checkout Reward (Night Owl)',
    maxPoints: 20,
    icon: '🦉',
    color: '#818cf8',
    description: 'Awarded on logout order: 1st logout gets 1 pt, each subsequent gets 1 pt more up to 20 pts (2nd: 2, 3rd: 3, ..., last: 20).'
  },
  {
    id: 'today_review',
    shortName: 'Review',
    fullName: 'Today Review Mark',
    maxPoints: 20,
    icon: '⭐',
    color: '#10b981',
    description: 'Daily review mark given directly by mentors.'
  },
  {
    id: 'leetcode',
    shortName: 'LeetCode',
    fullName: 'LeetCode Champion',
    maxPoints: 10,
    icon: '💻',
    color: '#f59e0b',
    description: 'Baseline score for all students (10 pts).'
  },
  {
    id: 'empathizer',
    shortName: 'Empathizer',
    fullName: 'Best Empathizer',
    maxPoints: 5,
    icon: '🤝',
    color: '#ec4899',
    description: 'Award up to 5 points for empathy, collaboration, and supporting teammates.'
  },
  {
    id: 'workbench',
    shortName: 'Workbench',
    fullName: 'Hands-on Planner (Workbench)',
    maxPoints: 10,
    icon: '🛠️',
    color: '#10b981',
    description: 'Award up to 10 points for practical implementation using SNS Agent Workbench.'
  },
  {
    id: 'frontend',
    shortName: 'Frontend',
    fullName: 'Visual Treater (Frontend)',
    maxPoints: 10,
    icon: '🎨',
    color: '#06b6d4',
    description: 'Award up to 10 points for frontend quality, usability, and visual design.'
  },
  {
    id: 'dt_playbook',
    shortName: 'DT Playbook',
    fullName: 'Journalizer (DT Playbook)',
    maxPoints: 5,
    icon: '📖',
    color: '#a855f7',
    description: 'Award up to 5 points for maintaining the Design Thinking Playbook.'
  },
  {
    id: 'assessment',
    shortName: 'Assessment',
    fullName: 'Assessment Cracker',
    maxPoints: 5,
    icon: '🎯',
    color: '#f43f5e',
    description: 'Award up to 5 points based on assessment performance.'
  },
  {
    id: 'okr',
    shortName: 'OKR',
    fullName: 'OKR Finalizer',
    maxPoints: 5,
    icon: '🏁',
    color: '#14b8a6',
    description: 'Award up to 5 points for completing assigned Objectives and Key Results.'
  },
  {
    id: 'all_rounder',
    shortName: 'All-Rounder',
    fullName: 'All-Round Performer',
    maxPoints: 25,
    icon: '⭐',
    color: '#eab308',
    description: 'Award up to 25 points for consistent overall performance across different activities.'
  },
  {
    id: 'team_lead',
    shortName: 'Team Lead',
    fullName: 'Best Team Lead',
    maxPoints: 25,
    icon: '👑',
    color: '#6366f1',
    description: 'Award up to 25 points for leadership, team coordination, communication, and helping the team achieve its goals.'
  }
];

export const TOTAL_MAX_POINTS = SCORING_CATEGORIES.reduce((sum, cat) => sum + cat.maxPoints, 0); // 115

/**
 * Realistic pilot study sample scoring records for demo mode
 */
export function generatePilotSampleScores() {
  const records = [];
  const now = new Date();
  
  // A curated distribution so top 3 podium looks great, with realistic remarks
  const sampleData = [
    { stdIdx: 9, catId: 'team_lead', pts: 24, rem: 'Exceptional team coordination during sprint delivery' },
    { stdIdx: 9, catId: 'all_rounder', pts: 23, rem: 'Outstanding consistency across all study modules' },
    { stdIdx: 9, catId: 'frontend', pts: 10, rem: 'Stunning animated UI dashboard implementation' },
    { stdIdx: 9, catId: 'workbench', pts: 9, rem: 'Integrated multiple agent tools seamlessly' },
    { stdIdx: 9, catId: 'early_bird', pts: 10, rem: 'Arrived early every single session' },
    { stdIdx: 9, catId: 'leetcode', pts: 5, rem: 'Completed all 5 weekly algorithm challenges' },
    { stdIdx: 9, catId: 'assessment', pts: 5, rem: 'Scored 100% on the core assessment' },
    { stdIdx: 9, catId: 'okr', pts: 5, rem: 'Achieved 100% OKR targets ahead of deadline' },
    
    { stdIdx: 0, catId: 'team_lead', pts: 22, rem: 'Great peer support and sprint organizing' },
    { stdIdx: 0, catId: 'all_rounder', pts: 24, rem: 'Remarkable diligence in lab exercises' },
    { stdIdx: 0, catId: 'frontend', pts: 9, rem: 'Clean responsive layouts and micro-interactions' },
    { stdIdx: 0, catId: 'workbench', pts: 8, rem: 'Built automated test harness on Workbench' },
    { stdIdx: 0, catId: 'empathizer', pts: 5, rem: 'Helped classmates debug tricky async calls' },
    { stdIdx: 0, catId: 'dt_playbook', pts: 5, rem: 'Comprehensive user interview documentation' },
    { stdIdx: 0, catId: 'night_owl', pts: 8, rem: 'Contributed insightful PR reviews past 7 PM' },
    
    { stdIdx: 7, catId: 'all_rounder', pts: 21, rem: 'Solid active participation and high code quality' },
    { stdIdx: 7, catId: 'team_lead', pts: 20, rem: 'Guided junior team members with patience' },
    { stdIdx: 7, catId: 'workbench', pts: 10, rem: 'Mastered SNS Agent Workbench pipelines' },
    { stdIdx: 7, catId: 'leetcode', pts: 5, rem: 'Solved hard dynamic programming questions' },
    { stdIdx: 7, catId: 'assessment', pts: 5, rem: 'Aced technical checkpoint #1' },
    { stdIdx: 7, catId: 'early_bird', pts: 8, rem: 'First to log in to morning standups' },
    
    { stdIdx: 1, catId: 'all_rounder', pts: 19, rem: 'High quality problem solving throughout' },
    { stdIdx: 1, catId: 'frontend', pts: 8, rem: 'Implemented dark mode and accessible components' },
    { stdIdx: 1, catId: 'leetcode', pts: 4, rem: 'Strong performance on tree algorithms' },
    { stdIdx: 1, catId: 'okr', pts: 4, rem: 'Delivered core milestone ahead of schedule' },
    
    { stdIdx: 2, catId: 'workbench', pts: 9, rem: 'Configured end-to-end workbench automation' },
    { stdIdx: 2, catId: 'team_lead', pts: 18, rem: 'Clear communication during demo sessions' },
    { stdIdx: 2, catId: 'night_owl', pts: 9, rem: 'Finalized release builds late evening' },
    
    { stdIdx: 8, catId: 'all_rounder', pts: 18, rem: 'Very dependable peer reviewer and coder' },
    { stdIdx: 8, catId: 'early_bird', pts: 9, rem: 'Punctual submission for all checkpoints' },
    { stdIdx: 8, catId: 'empathizer', pts: 4, rem: 'Listened actively and provided constructive feedback' },
    
    { stdIdx: 11, catId: 'frontend', pts: 9, rem: 'Superb typography and visual hierarchy' },
    { stdIdx: 11, catId: 'dt_playbook', pts: 4, rem: 'Thorough empathy mapping and problem framing' },
    
    { stdIdx: 17, catId: 'all_rounder', pts: 17, rem: 'Consistent progress across study tracks' },
    { stdIdx: 17, catId: 'assessment', pts: 4, rem: 'Solid score in mid-term evaluation' }
  ];

  sampleData.forEach((item, index) => {
    const student = INITIAL_STUDENTS[item.stdIdx];
    const category = SCORING_CATEGORIES.find(c => c.id === item.catId);
    if (student && category) {
      const timeOffsetMinutes = (sampleData.length - index) * 45;
      const recordDate = new Date(now.getTime() - timeOffsetMinutes * 60000);
      records.push({
        id: `rec-${Date.now()}-${index}`,
        studentId: student.id,
        studentName: student.name,
        categoryId: category.id,
        categoryName: category.fullName,
        maxPoints: category.maxPoints,
        awardedPoints: item.pts,
        remarks: item.rem,
        timestamp: recordDate.toISOString()
      });
    }
  });

  return records;
}
