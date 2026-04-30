export const THERAPY_EVENT_GROUPS = Object.freeze([
  {
    key: 'programs',
    title: 'Programs',
    items: [
      {
        key: 'skill-acquisition',
        label: 'Skill Acquisition',
        description: 'Correct or independent responding during acquisition targets.',
        payload: {
          eventType: 'program',
          eventCode: 'skill_acquisition_trial',
          label: 'Skill acquisition',
          metadata: { programName: 'Skill acquisition trial block' },
        },
        variantPrompt: {
          title: 'Trial outcome',
          options: [
            { label: 'Correct', detailLabel: 'Correct', metadata: { trialOutcome: 'correct' } },
            { label: 'Incorrect', detailLabel: 'Incorrect', metadata: { trialOutcome: 'incorrect' } },
            { label: 'Prompted', detailLabel: 'Prompted', metadata: { trialOutcome: 'prompted' } },
            { label: 'No Response', detailLabel: 'No response', metadata: { trialOutcome: 'no_response' } },
          ],
        },
      },
      {
        key: 'maintenance',
        label: 'Maintenance',
        description: 'Maintenance and retention practice.',
        payload: {
          eventType: 'program',
          eventCode: 'maintenance_program',
          label: 'Maintenance',
          metadata: { programName: 'Maintenance target review' },
        },
      },
      {
        key: 'generalization',
        label: 'Generalization',
        description: 'Generalization across staff, settings, or materials.',
        payload: {
          eventType: 'program',
          eventCode: 'generalization_program',
          label: 'Generalization',
          metadata: { programName: 'Generalization opportunity' },
        },
      },
      {
        key: 'prompt-fade',
        label: 'Prompt Fading',
        description: 'Prompt hierarchy reduced successfully.',
        payload: {
          eventType: 'milestone',
          eventCode: 'prompt_fading_success',
          label: 'Prompt fading success',
          metadata: { milestone: 'Prompt fading success' },
        },
      },
    ],
  },
  {
    key: 'behaviors',
    title: 'Interfering Behaviors',
    items: [
      {
        key: 'aggression',
        label: 'Aggression',
        description: 'Aggression incident logged.',
        payload: {
          eventType: 'behavior',
          eventCode: 'aggression',
          label: 'Aggression',
          intensity: 'Moderate',
          frequencyDelta: 1,
        },
      },
      {
        key: 'elopement',
        label: 'Elopement',
        description: 'Attempted to leave assigned area.',
        payload: {
          eventType: 'behavior',
          eventCode: 'elopement',
          label: 'Elopement',
          intensity: 'High',
          frequencyDelta: 1,
        },
      },
      {
        key: 'tantrum',
        label: 'Tantrum',
        description: 'Tantrum or sustained dysregulation.',
        payload: {
          eventType: 'behavior',
          eventCode: 'tantrum',
          label: 'Tantrum',
          intensity: 'Moderate',
          frequencyDelta: 1,
        },
      },
      {
        key: 'precursor',
        label: 'Precursor',
        description: 'Precursor or early warning behavior.',
        payload: {
          eventType: 'behavior',
          eventCode: 'precursor_behavior',
          label: 'Precursor behavior',
          intensity: 'Precursor',
          frequencyDelta: 1,
        },
      },
    ],
  },
  {
    key: 'prompting',
    title: 'Prompt Levels',
    items: [
      {
        key: 'independent',
        label: 'Independent',
        description: 'Responded independently.',
        payload: {
          eventType: 'milestone',
          eventCode: 'prompt_independent',
          label: 'Independent responding',
          metadata: { milestone: 'Independent responding' },
        },
      },
      {
        key: 'gestural',
        label: 'Gestural Prompt',
        description: 'Needed gestural prompting.',
        payload: {
          eventType: 'note',
          eventCode: 'gestural_prompt',
          label: 'Gestural prompt',
          metadata: { note: 'Gestural prompt level used.' },
        },
      },
      {
        key: 'verbal',
        label: 'Verbal Prompt',
        description: 'Needed verbal prompting.',
        payload: {
          eventType: 'note',
          eventCode: 'verbal_prompt',
          label: 'Verbal prompt',
          metadata: { note: 'Verbal prompt level used.' },
        },
      },
      {
        key: 'physical',
        label: 'Full Physical',
        description: 'Required full physical prompting.',
        payload: {
          eventType: 'note',
          eventCode: 'full_physical_prompt',
          label: 'Full physical prompt',
          metadata: { note: 'Full physical prompt level used.' },
        },
      },
    ],
  },
  {
    key: 'reinforcement',
    title: 'Reinforcement',
    items: [
      {
        key: 'primary-reinforcer',
        label: 'Primary Reinforcer',
        description: 'Food or sensory reinforcer delivered.',
        payload: {
          eventType: 'note',
          eventCode: 'primary_reinforcer',
          label: 'Primary reinforcer',
          metadata: { note: 'Primary reinforcer delivered.' },
        },
      },
      {
        key: 'secondary-reinforcer',
        label: 'Secondary Reinforcer',
        description: 'Praise, attention, or preferred activity delivered.',
        payload: {
          eventType: 'note',
          eventCode: 'secondary_reinforcer',
          label: 'Secondary reinforcer',
          metadata: { note: 'Secondary reinforcer delivered.' },
        },
      },
      {
        key: 'token-earned',
        label: 'Token Earned',
        description: 'Token board progress incremented.',
        payload: {
          eventType: 'milestone',
          eventCode: 'token_earned',
          label: 'Token earned',
          metadata: { milestone: 'Token earned toward reinforcement' },
        },
        variantPrompt: {
          title: 'Token progress',
          options: [
            { label: '+1 Token', detailLabel: '+1 token', metadata: { tokenProgress: 1 } },
            { label: '+2 Tokens', detailLabel: '+2 tokens', metadata: { tokenProgress: 2 } },
            { label: 'Board Complete', detailLabel: 'Board complete', metadata: { tokenProgress: 'board_complete' } },
          ],
        },
      },
    ],
  },
  {
    key: 'session-care',
    title: 'Meals, Toileting, Mood',
    items: [
      {
        key: 'snack',
        label: 'Snack',
        description: 'Meal or snack accepted.',
        payload: {
          eventType: 'meal',
          eventCode: 'snack',
          label: 'Snack',
          metadata: { type: 'Snack', note: 'Accepted snack.' },
        },
      },
      {
        key: 'lunch',
        label: 'Lunch',
        description: 'Lunch intake logged.',
        payload: {
          eventType: 'meal',
          eventCode: 'lunch',
          label: 'Lunch',
          metadata: { type: 'Lunch', note: 'Lunch intake logged.' },
        },
      },
      {
        key: 'toileting-success',
        label: 'Toileting Success',
        description: 'Successful toileting trip.',
        payload: {
          eventType: 'toileting',
          eventCode: 'toileting_success',
          label: 'Toileting success',
          metadata: { status: 'Successful' },
        },
      },
      {
        key: 'toileting-accident',
        label: 'Toileting Accident',
        description: 'Accident or unsuccessful trip.',
        payload: {
          eventType: 'toileting',
          eventCode: 'toileting_accident',
          label: 'Toileting accident',
          metadata: { status: 'Accident' },
        },
      },
      {
        key: 'mood-regulated',
        label: 'Mood 4',
        description: 'Regulated and engaged mood.',
        payload: {
          eventType: 'mood',
          eventCode: 'mood_4',
          label: 'Mood 4',
          score: 4,
          metadata: { score: 4, selectedValue: 4 },
        },
      },
      {
        key: 'mood-dysregulated',
        label: 'Mood 2',
        description: 'Dysregulated or frustrated mood.',
        payload: {
          eventType: 'mood',
          eventCode: 'mood_2',
          label: 'Mood 2',
          score: 2,
          metadata: { score: 2, selectedValue: 2 },
        },
      },
    ],
  },
  {
    key: 'notes',
    title: 'Notes & Communication',
    items: [
      {
        key: 'abc-note',
        label: 'ABC Note',
        description: 'Antecedent, behavior, consequence note marker.',
        payload: {
          eventType: 'note',
          eventCode: 'abc_note',
          label: 'ABC note',
          metadata: { note: 'ABC note captured for follow-up.' },
        },
        variantPrompt: {
          title: 'ABC segment',
          textPrompt: {
            title: 'ABC detail',
            placeholder: 'Enter a short antecedent, behavior, or consequence note',
            metadataKey: 'noteText',
          },
          options: [
            { label: 'Antecedent', detailLabel: 'Antecedent', metadata: { noteCategory: 'antecedent' } },
            { label: 'Behavior', detailLabel: 'Behavior', metadata: { noteCategory: 'behavior' } },
            { label: 'Consequence', detailLabel: 'Consequence', metadata: { noteCategory: 'consequence' } },
          ],
        },
      },
      {
        key: 'parent-communication',
        label: 'Parent Communication',
        description: 'Parent communication logged.',
        payload: {
          eventType: 'note',
          eventCode: 'parent_communication',
          label: 'Parent communication',
          metadata: { note: 'Parent communication log updated.' },
        },
        variantPrompt: {
          title: 'Communication type',
          textPrompt: {
            title: 'Parent communication detail',
            placeholder: 'Enter a short communication summary',
            metadataKey: 'communicationDetail',
          },
          options: [
            { label: 'Pick-up update', detailLabel: 'Pick-up update', metadata: { communicationType: 'pickup_update' } },
            { label: 'Phone call', detailLabel: 'Phone call', metadata: { communicationType: 'phone_call' } },
            { label: 'Message sent', detailLabel: 'Message sent', metadata: { communicationType: 'message_sent' } },
          ],
        },
      },
      {
        key: 'attendance-absence',
        label: 'Attendance Note',
        description: 'Attendance or absence note.',
        payload: {
          eventType: 'note',
          eventCode: 'attendance_note',
          label: 'Attendance note',
          metadata: { note: 'Attendance note recorded.' },
        },
        variantPrompt: {
          title: 'Attendance context',
          textPrompt: {
            title: 'Attendance detail',
            placeholder: 'Enter a short attendance or absence note',
            metadataKey: 'attendanceDetail',
          },
          options: [
            { label: 'Late arrival', detailLabel: 'Late arrival', metadata: { attendanceType: 'late_arrival' } },
            { label: 'Excused absence', detailLabel: 'Excused absence', metadata: { attendanceType: 'excused_absence' } },
            { label: 'Unexpected absence', detailLabel: 'Unexpected absence', metadata: { attendanceType: 'unexpected_absence' } },
          ],
        },
      },
      {
        key: 'incident-report',
        label: 'Safety Incident',
        description: 'Safety or incident report marker.',
        payload: {
          eventType: 'behavior',
          eventCode: 'safety_incident',
          label: 'Safety incident',
          intensity: 'Hazardous',
          frequencyDelta: 1,
        },
      },
      {
        key: 'bcba-review',
        label: 'BCBA Review',
        description: 'BCBA sign-off or review needed.',
        payload: {
          eventType: 'milestone',
          eventCode: 'bcba_review_needed',
          label: 'BCBA review',
          metadata: { milestone: 'BCBA review requested' },
        },
      },
    ],
  },
]);
