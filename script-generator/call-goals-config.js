// call-goals-config.js — Goal definitions with compatibility rules
// IMPORTANT: Keys are lowercase to match the IDs passed through the API

const CALL_GOALS = {
  book_appointment: {
    id: 'book_appointment',
    name: 'Book Appointment',
    description: 'Schedule a meeting or service appointment',
    category: 'scheduling',
    priority: 1,
    compatibleWith: ['qualify_lead', 'take_message', 'collect_feedback', 'provide_information'],
    incompatibleWith: ['handle_complaint'],
    requiredFields: ['service_type', 'duration', 'availability'],
    estimatedDuration: '2-4 minutes'
  },

  qualify_lead: {
    id: 'qualify_lead',
    name: 'Qualify Lead',
    description: 'Determine if caller is a good fit for services',
    category: 'sales',
    priority: 1,
    compatibleWith: ['book_appointment', 'collect_feedback', 'provide_information'],
    incompatibleWith: ['handle_complaint'],
    requiredFields: ['budget_range', 'timeline', 'decision_maker'],
    estimatedDuration: '3-5 minutes'
  },

  take_message: {
    id: 'take_message',
    name: 'Take Message',
    description: 'Capture a message for callback when staff is unavailable',
    category: 'support',
    priority: 2,
    compatibleWith: ['collect_feedback', 'verify_identity'],
    incompatibleWith: [],
    requiredFields: ['caller_name', 'phone_number', 'message_content'],
    estimatedDuration: '1-2 minutes'
  },

  handle_complaint: {
    id: 'handle_complaint',
    name: 'Handle Complaint',
    description: 'Address customer concerns and resolve issues empathetically',
    category: 'support',
    priority: 0, // Highest — always addressed first
    compatibleWith: ['collect_feedback', 'verify_identity'],
    incompatibleWith: ['book_appointment', 'qualify_lead', 'upsell_service'],
    requiredFields: ['issue_type', 'urgency_level', 'resolution_preference'],
    estimatedDuration: '5-10 minutes'
  },

  upsell_service: {
    id: 'upsell_service',
    name: 'Upsell Service',
    description: 'Offer additional or premium services to existing customers',
    category: 'sales',
    priority: 2,
    compatibleWith: ['book_appointment', 'collect_feedback'],
    incompatibleWith: ['handle_complaint'],
    requiredFields: ['current_service', 'upgrade_options'],
    estimatedDuration: '3-5 minutes'
  },

  collect_feedback: {
    id: 'collect_feedback',
    name: 'Collect Feedback',
    description: 'Gather customer satisfaction ratings or survey responses',
    category: 'research',
    priority: 3, // Always last — doesn't block anything
    compatibleWith: ['book_appointment', 'qualify_lead', 'take_message', 'handle_complaint'],
    incompatibleWith: [],
    requiredFields: ['rating_scale', 'feedback_topics'],
    estimatedDuration: '2-4 minutes'
  },

  verify_identity: {
    id: 'verify_identity',
    name: 'Verify Identity',
    description: 'Confirm caller identity before sharing sensitive information',
    category: 'security',
    priority: 0, // Must happen first if selected
    compatibleWith: ['book_appointment', 'handle_complaint', 'take_message'],
    incompatibleWith: [],
    requiredFields: ['verification_method', 'security_questions'],
    estimatedDuration: '1-2 minutes'
  },

  provide_information: {
    id: 'provide_information',
    name: 'Provide Information',
    description: 'Answer questions about hours, services, pricing, or location',
    category: 'support',
    priority: 2,
    compatibleWith: ['book_appointment', 'qualify_lead', 'collect_feedback'],
    incompatibleWith: [],
    requiredFields: ['info_categories'],
    estimatedDuration: '1-3 minutes'
  }
};

// Quick-start presets — goal IDs must match keys above
const GOAL_PRESETS = {
  SALES_CALL: {
    name: 'Sales Call',
    goals: ['qualify_lead', 'book_appointment', 'upsell_service'],
    description: 'Full sales conversation from qualification to booking',
    recommendedTone: 'professional'
  },
  CUSTOMER_SERVICE: {
    name: 'Customer Service',
    goals: ['handle_complaint', 'provide_information', 'collect_feedback'],
    description: 'Handle customer inquiries and resolve issues',
    recommendedTone: 'empathetic'
  },
  APPOINTMENT_CONFIRMATION: {
    name: 'Appointment Confirmation',
    goals: ['verify_identity', 'book_appointment', 'collect_feedback'],
    description: 'Confirm existing appointments and gather post-visit feedback',
    recommendedTone: 'friendly'
  },
  LEAD_GENERATION: {
    name: 'Lead Generation',
    goals: ['qualify_lead', 'take_message'],
    description: 'Capture potential leads efficiently for follow-up',
    recommendedTone: 'professional'
  }
};

module.exports = { CALL_GOALS, GOAL_PRESETS };
