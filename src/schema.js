// The content model. Everything listed here can be edited in /admin without changing code.
//
// Field types: text, textarea, markdown, number, date, boolean, image, file, select, slug, url, email
// i18n: true  -> the value is stored once per language, e.g. { en: "...", es: "...", pt: "..." }
// English is the fallback whenever a translation is missing.

export const LANGS = ['en', 'es', 'pt'];

export const MASS_SECTION_OPTIONS = [
  { value: 'lords_day', label: "Lord's Day (Saturday/Sunday)" },
  { value: 'weekday', label: 'Weekday Liturgies' },
];

export const WEEKDAY_OPTIONS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
];

export const LANG_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'multi', label: 'Multilingual' },
];

const MD = 'Use the toolbar to format text: headings, bold, italic, links, lists and quotes.';

const titleField = () => ({ key: 'title', label: 'Title', type: 'text', i18n: true, required: true });
const imageField = (label = 'Image (optional)') => ({
  key: 'image',
  label,
  type: 'image',
  help: 'Upload a photo or paste a link. The title is used as the image description.',
});
const orderField = (help = 'Lower numbers appear first.') => ({ key: 'order', label: 'Display order', type: 'number', help });

export const collections = {
  pages: {
    label: 'Pages',
    singular: 'page',
    idField: 'slug',
    sortBy: 'order',
    list: ['title', 'slug'],
    fields: [
      {
        key: 'slug',
        label: 'Web address',
        type: 'slug',
        required: true,
        help: 'Becomes the link: "about" opens /about. Use lowercase letters, numbers and hyphens.',
      },
      titleField(),
      { key: 'body', label: 'Content', type: 'markdown', i18n: true, help: MD },
      imageField('Banner image (optional)'),
      { key: 'nav', label: 'Show in the main menu', type: 'boolean' },
      orderField('Menu order: lower numbers appear first.'),
    ],
  },

  slides: {
    label: 'Home page photos',
    singular: 'photo',
    sortBy: 'order',
    list: ['title', 'order', 'hidden'],
    fields: [
      {
        key: 'image',
        label: 'Photo',
        type: 'image',
        required: true,
        help: 'Landscape photo, about 1200 × 900 pixels (4:3). The photos on the home page rotate through every visible photo, in the order below.',
      },
      { key: 'title', label: 'Description (for screen readers)', type: 'text', i18n: true, help: 'Briefly describe the photo. Translated automatically if a translation key is set.' },
      { key: 'caption_heading', label: 'Caption heading (optional)', type: 'text', i18n: true, help: 'Large line of text shown on top of the photo.' },
      { key: 'caption_body', label: 'Caption text (optional)', type: 'textarea', i18n: true, help: 'Smaller text shown under the heading.' },
      { key: 'link', label: 'Link when clicked (optional)', type: 'url', help: 'Starts with https://, or a page on this site such as /events' },
      { key: 'hidden', label: 'Hide this photo', type: 'boolean' },
      orderField('Rotation order: lower numbers appear first.'),
    ],
  },

  announcements: {
    label: 'Announcements',
    singular: 'announcement',
    sortBy: 'date-desc',
    list: ['title', 'date'],
    fields: [
      titleField(),
      { key: 'body', label: 'Message', type: 'markdown', i18n: true, help: MD },
      { key: 'date', label: 'Date posted', type: 'date', required: true },
      { key: 'pinned', label: 'Pin to the top', type: 'boolean' },
      { key: 'expires', label: 'Hide after this date (optional)', type: 'date' },
    ],
  },

  events: {
    label: 'Events',
    singular: 'event',
    sortBy: 'date-asc',
    list: ['title', 'date', 'time'],
    fields: [
      titleField(),
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'text', help: 'For example: 7:00 PM' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'description', label: 'Description', type: 'markdown', i18n: true, help: MD },
      imageField(),
      { key: 'link', label: 'Sign-up or more-info link (optional)', type: 'url', help: 'Starts with https://' },
    ],
  },

  ministries: {
    label: 'Ministries & Groups',
    singular: 'ministry',
    sortBy: 'order',
    list: ['name', 'contact_email'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', i18n: true, required: true },
      { key: 'description', label: 'Description', type: 'textarea', i18n: true },
      { key: 'meets', label: 'When it meets', type: 'text', i18n: true, help: 'For example: Tuesdays at 7 PM in the parish hall' },
      { key: 'contact_name', label: 'Contact person', type: 'text' },
      { key: 'contact_email', label: 'Contact email', type: 'email' },
      imageField(),
      orderField(),
    ],
  },

  staff: {
    label: 'Staff & Leaders',
    singular: 'person',
    sortBy: 'order',
    list: ['name', 'role'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'role', label: 'Role or title', type: 'text', i18n: true },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'text' },
      imageField('Photo (optional)'),
      orderField(),
    ],
  },

  bulletins: {
    label: 'Bulletins',
    singular: 'bulletin',
    sortBy: 'date-desc',
    list: ['title', 'date'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, help: 'For example: Weekly Bulletin, Advent 2026' },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'file', label: 'PDF file', type: 'file', required: true, help: 'Upload the PDF, or paste a link to it.' },
    ],
  },

  mass_times: {
    label: 'Mass & Service Times',
    singular: 'time',
    sortBy: 'schedule',
    list: ['section', 'weekday', 'date', 'time', 'language'],
    fields: [
      { key: 'section', label: 'Section', type: 'select', required: true, options: MASS_SECTION_OPTIONS, help: 'Lord\'s Day Masses are on Saturday and Sunday. Weekday Liturgies are Monday to Friday.' },
      { key: 'weekday', label: 'Day of the week', type: 'select', options: WEEKDAY_OPTIONS, help: 'For Masses that repeat every week. Add one entry per day. Leave blank for a one-time Mass and use the date instead.' },
      { key: 'date', label: 'Date (one-time Mass)', type: 'date', help: 'For holy days or special Masses. It disappears from the home page after it passes.' },
      { key: 'time', label: 'Time', type: 'text', required: true, help: 'For example: 9:00 AM' },
      { key: 'language', label: 'Language', type: 'select', options: LANG_OPTIONS, help: 'Shown next to the time so people know which Mass to attend.' },
      { key: 'streamed', label: 'Live streamed', type: 'boolean', help: 'Shows the live stream pop-up on the home page during this Mass.' },
      { key: 'location', label: 'Place (optional)', type: 'text', help: 'For example: Church, Parish Hall, Chapel' },
      { key: 'note', label: 'Note (optional)', type: 'text', i18n: true },
    ],
  },
};

export const settingsFields = [
  { key: 'parish_name', label: 'Parish name', type: 'text', i18n: true, required: true },
  { key: 'parish_subtitle', label: 'Subtitle, e.g. "Roman Catholic Parish"', type: 'text', i18n: true },
  { key: 'other_names', label: 'Name in other languages', type: 'text', help: 'Shown under the name on the home page.' },
  { key: 'tagline', label: 'Small text above the name', type: 'text', i18n: true },
  { key: 'welcome', label: 'Welcome message (home page)', type: 'markdown', i18n: true, help: MD },
  { key: 'address', label: 'Street address', type: 'textarea', help: 'One line per row. Shown in the footer.' },
  { key: 'archive_embed', label: 'Live Streaming page: archive embed code', type: 'textarea', help: 'Paste the archive embed code here. It appears on the Live Streaming page under the live player, exactly as pasted, so only paste code from a source you trust.' },
  { key: 'stream_url', label: 'Live stream address (HLS)', type: 'url', help: 'The .m3u8 address from your streaming provider. Leave blank to turn off the live pop-up.' },
  { key: 'bulletin_embed', label: 'Bulletins page: embed code (optional)', type: 'textarea', help: 'Paste the code from your bulletin service. When filled in, the Bulletins page shows it instead of uploaded bulletin files. It appears on the site exactly as pasted, so only paste code from a source you trust.' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'office_hours', label: 'Office hours', type: 'markdown', i18n: true, help: MD },
  { key: 'giving_url', label: 'Online giving link', type: 'url', help: 'Leave blank to hide the giving buttons.' },
  { key: 'giving_text', label: 'Giving message', type: 'textarea', i18n: true },
  { key: 'facebook_url', label: 'Facebook link', type: 'url' },
  { key: 'youtube_url', label: 'YouTube link', type: 'url' },
  { key: 'instagram_url', label: 'Instagram link', type: 'url' },
  { key: 'footer_note', label: 'Footer note', type: 'text', i18n: true },
  { key: 'timezone', label: 'Time zone', type: 'text', help: 'Used to decide which events are "upcoming". For example: America/New_York' },
];

// Web addresses that pages may not use, because the site already uses them.
export const RESERVED_SLUGS = [
  'admin', 'api', 'uploads', 'css', 'img', 'js', 'healthz',
  'events', 'ministries', 'bulletins', 'staff', 'mass-times', 'announcements', 'live-streaming', 'contact',
];
