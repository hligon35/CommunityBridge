// App-specific directory additions.
// These records are merged into persisted AsyncStorage data on startup (deduped by id).

export const additionalParents = [
  {
    id: 'parent-harold-001',
    name: 'Harold Ligon',
    phone: '317-432-3276',
    email: 'hligon35@gmail.com',
    avatar: 'https://example.com/avatars/harold.png',
  },
  {
    id: 'parent-cheyanne-001',
    name: 'Cheyanne Cook',
    phone: '463-710-2875',
    email: 'cheyanne2448@gmail.com',
    avatar: 'https://example.com/avatars/cheyanne.png',
  },
];

export const additionalChildren = [
  {
    id: 'child-lakelynn-001',
    name: 'Lakelynn Ligon',
    age: '11 yrs',
    room: 'POD-004',
    avatar: 'https://example.com/avatars/lakelynn.png',

    parents: [
      {
        id: 'parent-harold-001',
        name: 'Harold Ligon',
        phone: '317-432-3276',
        email: 'hligon35@gmail.com',
        avatar: 'https://example.com/avatars/harold.png',
      },
    ],

    assignedABA: ['aba-102', 'aba-204'],
    session: 'AM',

    carePlan: 'Focus on emotional regulation, peer interaction, and structured morning routines.',
    notes: 'Responds well to visual schedules and calm-down corner. Prefers quiet workspaces.',
    upcoming: [
      {
        id: 'event-501',
        title: 'Parent Check-in',
        when: 'Thursday 10:00 AM',
        whenISO: '2026-02-05T10:00:00',
      },
      {
        id: 'event-502',
        title: 'Progress Assessment',
        when: 'Next Monday',
        whenISO: '2026-02-09T09:00:00',
      },
    ],

    amTherapist: null,
    pmTherapist: null,
    bcaTherapist: null,
  },
  {
    id: 'child-zahari-002',
    name: 'Zahari Ligon',
    age: '4 yrs',
    room: 'POD-001',
    avatar: 'https://example.com/avatars/zahari.png',

    parents: [
      {
        id: 'parent-harold-001',
        name: 'Harold Ligon',
        phone: '317-432-3276',
        email: 'hligon35@gmail.com',
        avatar: 'https://example.com/avatars/harold.png',
      },
    ],

    assignedABA: ['aba-001'],
    session: 'PM',

    carePlan: 'Early developmental support with emphasis on communication and sensory integration.',
    notes: 'Enjoys tactile activities and responds well to positive reinforcement.',
    upcoming: [
      {
        id: 'event-503',
        title: 'Sensory Play Day',
        when: 'Friday 1:00 PM',
        whenISO: '2026-02-06T13:00:00',
      },
    ],

    amTherapist: null,
    pmTherapist: null,
    bcaTherapist: null,
  },
  {
    id: 'child-aubrey-003',
    name: 'Aubrey Cook',
    age: '8 yrs',
    room: 'POD-003',
    avatar: 'https://example.com/avatars/aubrey.png',

    parents: [
      {
        id: 'parent-cheyanne-001',
        name: 'Cheyanne Cook',
        phone: '463-710-2875',
        email: 'cheyanne2448@gmail.com',
        avatar: 'https://example.com/avatars/cheyanne.png',
      },
    ],

    assignedABA: ['aba-150', 'aba-301'],
    session: 'AM',

    carePlan: 'Support academic focus, coping strategies, and structured transitions between activities.',
    notes: 'Very social; benefits from guided peer interactions and structured task lists.',
    upcoming: [
      {
        id: 'event-504',
        title: 'Therapy Review',
        when: 'Wednesday 9:30 AM',
        whenISO: '2026-02-04T09:30:00',
      },
    ],

    amTherapist: null,
    pmTherapist: null,
    bcaTherapist: null,
  },
];
