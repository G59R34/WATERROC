// Node script to capture active window data and send to Supabase
// This is a scaffold - to use it install dependencies in this folder and run via electron or node.

const activeWin = require('active-win');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service role key NOT recommended on client

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function captureAndSend(employeeId, sessionId) {
  try {
    const info = await activeWin();
    const payload = {
      employee_id: employeeId,
      session_id: sessionId,
      category: 'window',
      detail: JSON.stringify({ title: info.title, owner: info.owner }),
      idle_seconds: 0
    };
    await supabase.rpc('insert_activity_log', payload);
    console.log('Sent activity', payload);
  } catch (err) {
    console.error('capture error', err);
  }
}

module.exports = { captureAndSend };
