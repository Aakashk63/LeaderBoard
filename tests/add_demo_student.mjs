import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iridkxcusdcwqgtytspg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8QXnrStdwmwIAFtt_c2RQ_We3OAfRx';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addDemoStudent() {
  const zeroScores = {
    leetcode: 0,
    workbench: 0,
    assessment: 0,
    all_rounder: 0,
    dt_playbook: 0,
    frontend: 0,
    okr: 0,
    empathizer: 0,
    team_lead: 0,
    early_bird: 0,
    night_owl: 0
  };

  const { data, error } = await supabase
    .from('pilotstudy')
    .upsert({
      id: 'std-demo',
      student_name: 'Demo Student',
      total_points: 0,
      max_points: 115,
      percentage: 0,
      rank: 1,
      category_scores: zeroScores,
      remarks: 'Official Demo Student Account',
      base_points: 0,
      cumulative_points: 0,
      attendance_points: 0,
      early_bird_count: 0,
      night_owl_count: 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

  if (error) {
    console.error('Error adding demo student:', error);
  } else {
    console.log('Successfully added/updated Demo Student std-demo in pilotstudy table.');
  }

  const { data: check } = await supabase.from('pilotstudy').select('*').eq('id', 'std-demo');
  console.log('Demo student in DB:', check);
}

addDemoStudent();
