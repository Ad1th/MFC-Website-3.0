import { z } from 'zod';

/** Words and phrases banned on set (director script, BANNED ON SET). */
export const BANNED_PHRASES = [
  'unleash',
  'elevate',
  'empower',
  'seamless',
  'cutting-edge',
  'journey',
  'innovative',
  'passionate',
  'thrive',
  'dive in',
  'we believe',
  'at the intersection of',
];

/** "not just X, but Y" in any form. */
export const BANNED_PATTERNS = [/\bnot just\b[^.]*,\s*but\b/i];

/** Em dash and en dash. Hyphen is the only dash allowed. */
export const DASH_PATTERN = /[\u2014\u2013]/;

const url = z.url({ protocol: /^https?$/ });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const isoDateTime = z.iso.datetime({ offset: true });
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected kebab-case slug');
const mediaPath = (folder) =>
  z.string().regex(new RegExp(`^/media/${folder}/[a-z0-9/_-]+\\.webp$`), `expected /media/${folder}/...webp`);
const todo = z.string().startsWith('TODO_CONTENT');

export const siteSchema = z.strictObject({
  name: z.string().min(1),
  short: z.string().min(1),
  institution: z.string().min(1),
  email: z.email(),
  recruitmentUrl: url,
  campus: z.strictObject({ lat: z.number(), lon: z.number(), label: z.string().min(1) }),
  socials: z.array(z.strictObject({ label: z.string().min(1), url })).min(1),
  about: z.array(z.string().min(1)).min(1),
  taglines: z.array(z.string().min(1)).length(3),
  description: z.string().min(20).max(160),
});

export const domainsSchema = z
  .array(
    z.strictObject({
      key: z.enum(['technical', 'design', 'management']),
      title: z.string().min(1),
      room: z.string().min(1),
      subs: z.array(z.string().min(1)).min(1),
    }),
  )
  .length(3);

export const projectsSchema = z
  .array(
    z.strictObject({
      slug,
      number: z.string().regex(/^\d{2}$/),
      name: z.string().min(1),
      tagline: z.string().min(1).max(60),
      description: z.string().min(20).max(320),
      stack: z.array(z.string().min(1)).min(1),
      link: url,
      linkType: z.enum(['visit', 'source']),
      image: mediaPath('projects'),
      imageAlt: z.string().min(10),
    }),
  )
  .min(1);

const wordCount = (s) => s.trim().split(/\s+/).length;

export const eventsSchema = z
  .array(
    z.strictObject({
      slug,
      name: z.string().min(1),
      date: isoDate,
      flagship: z.boolean(),
      summary: z.string().refine((s) => wordCount(s) <= 25, 'summary must be 25 words or fewer'),
      description: z.string().min(10),
      link: url,
      image: mediaPath('events').nullable(),
    }),
  )
  .min(1)
  .refine((list) => list.every((e, i) => i === 0 || list[i - 1].date >= e.date), 'events must be sorted newest first');

const linkKeys = z.enum(['linkedin', 'github', 'instagram', 'website']);

export const teamSchema = z.strictObject({
  faculty: z.strictObject({
    name: z.string().min(1),
    role: z.string().min(1),
    bio: z.string().min(20),
    photo: mediaPath('team'),
    links: z.partialRecord(linkKeys, url),
  }),
  years: z.record(
    z.string().regex(/^\d{4}-\d{2}$/),
    z
      .array(
        z.strictObject({
          name: z.string().min(1),
          role: z.string().min(1),
          domain: z.enum(['core', 'technical', 'design', 'management', 'mentor']),
          photo: mediaPath('team').nullable(),
          links: z.partialRecord(linkKeys, url),
        }),
      )
      .min(1),
  ),
});

export const newslettersSchema = z.strictObject({
  todo: todo.optional(),
  items: z.array(
    z.strictObject({
      title: z.string().min(1),
      uploadDate: z.string().min(1),
      cover_url: url,
      pdf_link: url,
    }),
  ),
});

export const creditsSchema = z.strictObject({
  builders: z.strictObject({
    todo: todo.optional(),
    people: z.array(z.strictObject({ name: z.string().min(1), role: z.string().min(1).optional() })),
  }),
  assets: z
    .array(z.strictObject({ what: z.string().min(1), by: z.string().min(1), license: z.string().min(1), source: url }))
    .min(1),
});

export const blogsSchema = z.array(
  z.strictObject({
    title: z.string().min(1),
    url,
    date: isoDate,
    author: z.string().min(1),
    excerpt: z.string(),
    image: url.nullable(),
  }),
);

export const commitsSchema = z
  .array(
    z.strictObject({
      repo: z.string().min(1),
      actor: z.string().min(1),
      type: z.enum(['commit', 'push', 'pull_request', 'create']),
      createdAt: isoDateTime,
    }),
  )
  .max(40);

/** File name (relative to src/content) to schema. Generated files are optional. */
export const CONTENT_FILES = [
  { file: 'site.json', schema: siteSchema },
  { file: 'domains.json', schema: domainsSchema },
  { file: 'projects.json', schema: projectsSchema },
  { file: 'events.json', schema: eventsSchema },
  { file: 'team.json', schema: teamSchema },
  { file: 'newsletters.json', schema: newslettersSchema },
  { file: 'credits.json', schema: creditsSchema },
  { file: 'generated/blogs.json', schema: blogsSchema, optional: true },
  { file: 'generated/commits.json', schema: commitsSchema, optional: true },
];
