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
            { label: 'Independent', detailLabel: 'Independent', metadata: { trialOutcome: 'independent' } },
            { label: 'Correct Prompt', detailLabel: 'Correct with prompt', metadata: { trialOutcome: 'correct_prompt' } },
            { label: 'Incorrect', detailLabel: 'Incorrect', metadata: { trialOutcome: 'incorrect' } },
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
        variantPrompt: {
          title: 'Maintenance outcome',
          options: [
            { label: 'Independent', detailLabel: 'Independent correct', metadata: { maintenanceOutcome: 'independent' } },
            { label: 'Prompted', detailLabel: 'Needed prompt', metadata: { maintenanceOutcome: 'prompted' } },
            { label: 'Incorrect', detailLabel: 'Incorrect', metadata: { maintenanceOutcome: 'incorrect' } },
          ],
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
        variantPrompt: {
          title: 'Generalization context',
          options: [
            { label: 'Across Staff', detailLabel: 'Across staff', metadata: { generalizationType: 'staff' } },
            { label: 'Across Settings', detailLabel: 'Across settings', metadata: { generalizationType: 'settings' } },
            { label: 'Across Materials', detailLabel: 'Across materials', metadata: { generalizationType: 'materials' } },
          ],
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
        variantPrompt: {
          title: 'Prompt fade step',
          options: [
            { label: 'Physical to Partial', detailLabel: 'Physical to partial', metadata: { fadeStep: 'physical_partial' } },
            { label: 'Model to Gesture', detailLabel: 'Model to gesture', metadata: { fadeStep: 'model_gesture' } },
            { label: 'Verbal to Independent', detailLabel: 'Verbal to independent', metadata: { fadeStep: 'verbal_independent' } },
          ],
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
        variantPrompt: {
          title: 'Aggression type',
          options: [
            { label: 'Hit', detailLabel: 'Hit', metadata: { behaviorType: 'hit' } },
            { label: 'Kick', detailLabel: 'Kick', metadata: { behaviorType: 'kick' } },
            { label: 'Bite', detailLabel: 'Bite', metadata: { behaviorType: 'bite' } },
            { label: 'Throw Object', detailLabel: 'Throw object', metadata: { behaviorType: 'throw_object' } },
          ],
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
        variantPrompt: {
          title: 'Elopement type',
          options: [
            { label: 'Left Seat', detailLabel: 'Left seat', metadata: { behaviorType: 'left_seat' } },
            { label: 'Left Area', detailLabel: 'Left area', metadata: { behaviorType: 'left_area' } },
            { label: 'Ran from Staff', detailLabel: 'Ran from staff', metadata: { behaviorType: 'ran_from_staff' } },
            { label: 'Exit Attempt', detailLabel: 'Attempted exit', metadata: { behaviorType: 'exit_attempt' } },
          ],
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
        variantPrompt: {
          title: 'Tantrum type',
          options: [
            { label: 'Crying', detailLabel: 'Crying', metadata: { behaviorType: 'crying' } },
            { label: 'Screaming', detailLabel: 'Screaming', metadata: { behaviorType: 'screaming' } },
            { label: 'Drop to Floor', detailLabel: 'Dropped to floor', metadata: { behaviorType: 'drop_to_floor' } },
            { label: 'Over 5 Min', detailLabel: 'Duration over 5 min', metadata: { behaviorType: 'duration_over_5' } },
          ],
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
        variantPrompt: {
          title: 'Precursor type',
          options: [
            { label: 'Whining', detailLabel: 'Whining', metadata: { behaviorType: 'whining' } },
            { label: 'Pacing', detailLabel: 'Pacing', metadata: { behaviorType: 'pacing' } },
            { label: 'Avoidance', detailLabel: 'Avoidance', metadata: { behaviorType: 'avoidance' } },
            { label: 'Noncompliance', detailLabel: 'Early noncompliance', metadata: { behaviorType: 'early_noncompliance' } },
          ],
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
        variantPrompt: {
          title: 'Independent result',
          options: [
            { label: 'Correct', detailLabel: 'Independent correct', metadata: { promptLevel: 'independent_correct' } },
            { label: 'Incorrect', detailLabel: 'Independent incorrect', metadata: { promptLevel: 'independent_incorrect' } },
            { label: 'Refusal', detailLabel: 'Independent refusal', metadata: { promptLevel: 'independent_refusal' } },
            { label: 'Partial', detailLabel: 'Partial correct', metadata: { promptLevel: 'independent_partial' } },
          ],
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
        variantPrompt: {
          title: 'Gestural prompt used',
          options: [
            { label: 'Pointing', detailLabel: 'Pointing', metadata: { promptUsed: 'pointing' } },
            { label: 'Motion Cue', detailLabel: 'Motion cue', metadata: { promptUsed: 'motion_cue' } },
            { label: 'Eye Gaze', detailLabel: 'Eye gaze cue', metadata: { promptUsed: 'eye_gaze' } },
            { label: 'Visual Cue', detailLabel: 'Visual cue', metadata: { promptUsed: 'visual_cue' } },
          ],
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
        variantPrompt: {
          title: 'Verbal prompt used',
          options: [
            { label: 'Partial', detailLabel: 'Partial verbal', metadata: { promptUsed: 'partial_verbal' } },
            { label: 'Full', detailLabel: 'Full verbal', metadata: { promptUsed: 'full_verbal' } },
            { label: 'Repeated', detailLabel: 'Repeated verbal', metadata: { promptUsed: 'repeated_verbal' } },
            { label: 'Model Lead', detailLabel: 'Modelled after verbal cue', metadata: { promptUsed: 'model_lead' } },
          ],
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
        variantPrompt: {
          title: 'Physical prompt used',
          options: [
            { label: 'Hand-over-hand', detailLabel: 'Hand-over-hand', metadata: { promptUsed: 'hand_over_hand' } },
            { label: 'Partial Physical', detailLabel: 'Partial physical', metadata: { promptUsed: 'partial_physical' } },
            { label: 'Safety Guide', detailLabel: 'Safety physical guidance', metadata: { promptUsed: 'safety_guidance' } },
            { label: 'Full Physical', detailLabel: 'Full physical', metadata: { promptUsed: 'full_physical' } },
          ],
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
        variantPrompt: {
          title: 'Primary reinforcement',
          options: [
            { label: 'Edible', detailLabel: 'Edible delivered', metadata: { reinforcementType: 'edible' } },
            { label: 'Sensory', detailLabel: 'Sensory delivered', metadata: { reinforcementType: 'sensory' } },
            { label: 'Break', detailLabel: 'Break delivered', metadata: { reinforcementType: 'break' } },
          ],
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
        variantPrompt: {
          title: 'Secondary reinforcement',
          options: [
            { label: 'Praise', detailLabel: 'Praise', metadata: { reinforcementType: 'praise' } },
            { label: 'High-five', detailLabel: 'High-five', metadata: { reinforcementType: 'high_five' } },
            { label: 'Token', detailLabel: 'Token delivered', metadata: { reinforcementType: 'token' } },
          ],
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
        key: 'meal',
        label: 'Meals',
        description: 'Record meal acceptance or refusal.',
        payload: {
          eventType: 'meal',
          eventCode: 'meal_note',
          label: 'Meal',
          metadata: { type: 'Meal', note: 'Meal intake logged.' },
        },
        variantPrompt: {
          title: 'Meal detail',
          options: [
            { label: 'Breakfast', detailLabel: 'Breakfast', metadata: { mealType: 'breakfast' } },
            { label: 'Snack', detailLabel: 'Snack', metadata: { mealType: 'snack' } },
            { label: 'Lunch', detailLabel: 'Lunch', metadata: { mealType: 'lunch' } },
          ],
        },
      },
      {
        key: 'toileting',
        label: 'Toileting',
        description: 'Record toileting success or accidents.',
        payload: {
          eventType: 'toileting',
          eventCode: 'toileting_note',
          label: 'Toileting',
          metadata: { status: 'Logged' },
        },
        variantPrompt: {
          title: 'Toileting detail',
          options: [
            { label: 'Success', detailLabel: 'Prompted success', metadata: { toiletingType: 'success' } },
            { label: 'Accident', detailLabel: 'Accident', metadata: { toiletingType: 'accident' } },
            { label: 'Independent', detailLabel: 'Initiated independently', metadata: { toiletingType: 'independent' } },
          ],
        },
      },
      {
        key: 'mood',
        label: 'Mood',
        description: 'Log current mood regulation score.',
        payload: {
          eventType: 'mood',
          eventCode: 'mood_score',
          label: 'Mood',
          score: 5,
          metadata: { score: 5, selectedValue: 5 },
        },
        variantPrompt: {
          title: 'Mood score',
          options: [
            { label: '1', detailLabel: 'Mood 1', metadata: { moodScore: 1 } },
            { label: '3', detailLabel: 'Mood 3', metadata: { moodScore: 3 } },
            { label: '5', detailLabel: 'Mood 5', metadata: { moodScore: 5 } },
            { label: '7', detailLabel: 'Mood 7', metadata: { moodScore: 7 } },
            { label: '10', detailLabel: 'Mood 10', metadata: { moodScore: 10 } },
          ],
        },
      },
    ],
  },
]);
