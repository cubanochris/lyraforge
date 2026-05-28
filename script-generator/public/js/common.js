// ========================================
// SHARED UTILITIES (common.js)
// ========================================

// Constants
const GOALS = ['book_appointment', 'qualify_lead', 'take_message', 'handle_objections', 'collect_info', 'schedule_callback'];
const TONES = ['professional', 'friendly', 'formal', 'warm', 'energetic'];
const VOICES = ['ElevenLabs - Rachel', 'ElevenLabs - Adam', 'Cartesia - Default'];
const TIERS = ['Starter', 'Professional', 'Business Pro', 'Enterprise'];
const TIER_CLASSES = {
  'Starter': 'sub-starter',
  'Professional': 'sub-professional',
  'Business Pro': 'sub-business-pro',
  'Enterprise': 'sub-enterprise'
};

const password = 'lyraforge';

function authHeader() {
  const pw = sessionStorage.getItem('adminPassword') || '';
  return 'Basic ' + btoa(':' + pw);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(function() { t.className = 'toast'; }, 3000);
}

function login() {
  const pw = prompt('Enter admin password:');
  if (!pw) return;
  sessionStorage.setItem('adminPassword', pw);
  location.reload();
}
