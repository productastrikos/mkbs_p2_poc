// Forms opened by AI-insight action buttons. Field types: select | text | textarea; required fields must be filled.
export const ACTION_FORMS = {
  notify: {
    title: 'Notify stakeholder',
    fields: [
      { key: 'audience', label: 'Audience', type: 'select', options: ['JKR (SCATS approvals)', 'JKNS / KKM (ambulances)', 'PDRM (traffic police)', 'BOMBA', 'MBKS management'] },
      { key: 'channel', label: 'Channel', type: 'select', options: ['Email', 'Official letter', 'Email + WhatsApp group'] },
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Message text…', required: true },
    ],
  },
  task: {
    title: 'Create task',
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Short description', required: true },
      { key: 'team', label: 'Team', type: 'select', options: ['MBKS traffic engineering', 'SCATS operations', 'Roadside unit maintenance', 'Data & AI'] },
      { key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
      { key: 'details', label: 'Details', type: 'textarea', placeholder: 'What needs to be done…' },
    ],
  },
  survey: {
    title: 'Schedule site survey',
    fields: [
      { key: 'junction', label: 'Junction', type: 'text', placeholder: 'e.g. J01', required: true },
      { key: 'with', label: 'Joint with', type: 'select', options: ['JKR', 'JKR + PDRM', 'Technical partner'] },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Scope of the survey…' },
    ],
  },
};
