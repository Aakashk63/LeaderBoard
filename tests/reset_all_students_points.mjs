import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iridkxcusdcwqgtytspg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8QXnrStdwmwIAFtt_c2RQ_We3OAfRx';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function resetAll() {
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

  const { error: updateErr } = await supabase
    .from('pilotstudy')
    .update({
      total_points: 0,
      base_points: 0,
      cumulative_points: 0,
      attendance_points: 0,
      rank: 1,
      percentage: 0,
      category_scores: zeroScores
    })
    .neq('id', '');

  if (updateErr) {
    console.error('Update error:', updateErr);
  } else {
    console.log('Successfully updated all pilotstudy students to 0 points.');
  }

  const { error: attErr } = await supabase
    .from('student_attendance')
    .delete()
    .neq('id', '');

  if (attErr) console.warn('Attendance delete warning:', attErr);
  else console.log('Successfully cleared student_attendance table.');

  const { error: awdErr } = await supabase
    .from('daily_attendance_awards')
    .delete()
    .neq('id', '');

  if (awdErr) console.warn('Awards delete warning:', awdErr);
  else console.log('Successfully cleared daily_attendance_awards table.');

  const { data: students } = await supabase.from('pilotstudy').select('id, student_name, total_points');
  console.log('Students count:', students?.length);
  const nonZero = students?.filter(s => s.total_points > 0);
  console.log('Non-zero students:', nonZero);
}

resetAll();
