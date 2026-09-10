import { useEffect, useMemo, useRef, useState } from 'react';
import { site, domains, projects, events, team, years, blogs, credits, shortDate, longDate, avifOf } from '../content/index.js';
import { loadNewsletters } from '../live/newsletters.js';
import { layout, totalVh, MOBILE_QUERY } from '../film/timeline.js';
import Contact from './Contact.jsx';
import styles from './Semantic.module.css';

/**
 * The whole site as real, accessible HTML, in document order.
 * variant="still": normal flow, visible (graphic-novel mode).
 * variant="film": each region sits inside its scene's slice of the scroll
 * track, hidden until its scene is active or it receives keyboard focus.
 */

const LINK_LABEL = { linkedin: 'linkedin', github: 'github', instagram: 'instagram', website: 'website' };

function Picture({ src, alt, width, height, className, loading = 'lazy' }) {
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={avifOf(src)} />
      <img src={src} alt={alt} width={width} height={height} loading={loading} decoding="async" />
    </picture>
  );
}

function ExternalLink({ href, children, className }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer" data-cursor="link">
      {children}
    </a>
  );
}

function hostLabel(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host.includes('github')) return 'github';
  if (host.includes('instagram')) return 'instagram';
  return host;
}

function Intro() {
  return (
    <section id="intro" className={styles.intro} aria-labelledby="intro-title">
      <p className={`hud ${styles.kicker}`}>{site.institution.toLowerCase()}</p>
      <h1 id="intro-title" className={styles.title}>
        MOZILLA FIREFOX CLUB
      </h1>
      <p className={styles.taglines}>
        {site.taglines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
    </section>
  );
}

function About() {
  return (
    <section id="about" className={styles.about} aria-labelledby="about-title">
      <h2 id="about-title" className="visually-hidden">
        About the club
      </h2>
      <p className={styles.aboutLines}>
        {site.about.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
    </section>
  );
}

function Domains() {
  return (
    <section id="domains" className={styles.domains} aria-labelledby="domains-title">
      <h2 id="domains-title" className={styles.sectionMark}>
        three rooms.
      </h2>
      <ul className={styles.rooms}>
        {domains.map((d) => (
          <li key={d.key} className={styles.room}>
            <p className={`hud ${styles.roomName}`}>{d.room}</p>
            <h3 className={styles.roomTitle}>{d.title}</h3>
            <ul className={styles.subs} aria-label={`${d.title.toLowerCase()} domains`}>
              {d.subs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Projects() {
  return (
    <section id="projects" className={styles.projects} aria-labelledby="projects-title">
      <h2 id="projects-title" className={styles.sectionMark}>
        things we shipped.
      </h2>
      <ol className={styles.projectList}>
        {projects.map((p, i) => (
          <li key={p.slug} className={styles.project}>
            <div className={styles.projectText}>
              <p className={`hud ${styles.projectCount}`}>
                {p.number} / {String(projects.length).padStart(2, '0')}
              </p>
              <h3 className={styles.projectName}>{p.name}</h3>
              <p className={styles.projectTagline}>{p.tagline}</p>
              <p className={styles.projectDescription}>{p.description}</p>
              <p className={`hud ${styles.stack}`}>{p.stack.join('  ')}</p>
              <ExternalLink href={p.link} className={styles.projectLink}>
                {p.linkType} ↗<span className="visually-hidden"> {p.name.toLowerCase()} (opens in a new tab)</span>
              </ExternalLink>
            </div>
            <Picture
              src={p.image}
              alt={p.imageAlt}
              width={1600}
              height={860}
              className={styles.projectShot}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Events() {
  return (
    <section id="events" className={styles.events} aria-labelledby="events-title">
      <h2 id="events-title" className={styles.sectionMark}>
        what we ran.
      </h2>
      <ol className={styles.eventList}>
        {events.map((e) => (
          <li key={e.slug} className={e.flagship ? styles.flagship : styles.event}>
            <time className={`hud ${styles.eventDate}`} dateTime={e.date}>
              <span aria-hidden="true">{shortDate(e.date)}</span>
              <span className="visually-hidden">{longDate(e.date)}</span>
            </time>
            <h3 className={styles.eventName}>{e.name}</h3>
            {e.flagship ? <p className={styles.eventSummary}>{e.summary}</p> : null}
            <ExternalLink href={e.link} className={styles.eventLink}>
              {hostLabel(e.link)} ↗<span className="visually-hidden"> {e.name} (opens in a new tab)</span>
            </ExternalLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Writing() {
  const [newsletters, setNewsletters] = useState([]);
  useEffect(() => {
    let alive = true;
    loadNewsletters().then(({ items }) => {
      if (alive) setNewsletters(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  const medium = site.socials.find((s) => s.label === 'medium')?.url;
  const [latest, ...rest] = blogs;

  return (
    <section id="writing" className={styles.writing} data-theme="paper" aria-labelledby="writing-title">
      <h2 id="writing-title" className={styles.writingMark}>
        WE ALSO WRITE.
      </h2>

      {latest ? (
        <article className={styles.latest}>
          <h3 className={styles.latestTitle}>
            <ExternalLink href={latest.url}>{latest.title}</ExternalLink>
          </h3>
          <p className={`hud ${styles.byline}`}>
            {latest.author.toLowerCase()} <time dateTime={latest.date}>{shortDate(latest.date)}</time>
          </p>
          <p className={styles.excerpt}>{latest.excerpt}</p>
        </article>
      ) : null}

      {rest.length ? (
        <ol className={styles.postIndex} aria-label="more posts">
          {rest.map((post) => (
            <li key={post.url}>
              <ExternalLink href={post.url}>{post.title}</ExternalLink>
              <time className="hud" dateTime={post.date}>
                {shortDate(post.date)}
              </time>
            </li>
          ))}
        </ol>
      ) : null}

      {newsletters.length ? (
        <ul className={styles.covers} aria-label="newsletters">
          {newsletters.map((n) => (
            <li key={n.pdf}>
              <ExternalLink href={n.pdf} className={styles.cover}>
                <img src={n.cover} alt="" loading="lazy" decoding="async" width={600} height={848} />
                <span className={styles.coverTitle}>{n.title}</span>
              </ExternalLink>
            </li>
          ))}
        </ul>
      ) : null}

      {medium ? (
        <p className={styles.mediumLink}>
          <ExternalLink href={medium}>all of it on medium ↗</ExternalLink>
        </p>
      ) : null}
    </section>
  );
}

function Team() {
  const [year, setYear] = useState(years[0]);
  const members = team.years[year];
  const { faculty } = team;

  return (
    <section id="team" className={styles.team} aria-labelledby="team-title">
      <h2 id="team-title" className={styles.sectionMark}>
        the people who kept the fire lit.
      </h2>

      <article className={styles.faculty} aria-label="faculty coordinator">
        <Picture src={faculty.photo} alt="" width={480} height={480} className={styles.facultyPhoto} />
        <div>
          <h3 className={styles.facultyName}>{faculty.name}</h3>
          <p className={`hud ${styles.role}`}>{faculty.role.toLowerCase()}</p>
          <p className={styles.bio}>{faculty.bio}</p>
          <LinkRow name={faculty.name} links={faculty.links} />
        </div>
      </article>

      <fieldset className={styles.yearDial}>
        <legend className="hud">board year</legend>
        {years.map((y) => (
          <label key={y} className={styles.yearOption}>
            <input type="radio" name="board-year" value={y} checked={y === year} onChange={() => setYear(y)} />
            <span>{y}</span>
          </label>
        ))}
      </fieldset>

      <ul className={styles.members} aria-live="polite" aria-label={`board ${year}, ${members.length} members`}>
        {members.map((m) => (
          <li key={`${year}-${m.name}`} className={styles.member}>
            {m.photo ? <Picture src={m.photo} alt="" width={480} height={480} className={styles.portrait} /> : null}
            <div>
              <h3 className={styles.memberName}>{m.name}</h3>
              <p className={`hud ${styles.role}`}>{m.role.toLowerCase()}</p>
              <LinkRow name={m.name} links={m.links} />
            </div>
          </li>
        ))}
        <li className={styles.member}>
          <div>
            <p className={styles.memberName}>this one could be you.</p>
            <ExternalLink href={site.recruitmentUrl} className={`hud ${styles.join}`}>
              enrollments ↗
            </ExternalLink>
          </div>
        </li>
      </ul>
    </section>
  );
}

function LinkRow({ name, links }) {
  const entries = Object.entries(links);
  if (!entries.length) return null;
  return (
    <ul className={`hud ${styles.links}`}>
      {entries.map(([key, url]) => (
        <li key={key}>
          <ExternalLink href={url}>
            {LINK_LABEL[key] ?? key}
            <span className="visually-hidden">
              {' '}
              of {name} (opens in a new tab)
            </span>
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}

function ContactRegion() {
  return (
    <section id="contact" className={styles.contact} aria-labelledby="contact-title">
      <h2 id="contact-title" className={styles.contactMark}>
        YOUR MOVE.
      </h2>
      <Contact />
    </section>
  );
}

function End() {
  const year = new Date().getFullYear();
  const credited = credits.assets.filter((a) => a.what.startsWith('Fox'));
  return (
    <footer id="end" className={styles.end}>
      <p className={styles.wordmark} aria-hidden="true">
        FIREFOX
      </p>
      <ul className={styles.socials} aria-label="club on the web">
        {site.socials.map((s) => (
          <li key={s.label}>
            <ExternalLink href={s.url}>{s.label}</ExternalLink>
          </li>
        ))}
      </ul>
      <p className={styles.legal}>
        © {year} {site.name}, {site.institution}.
      </p>
      <p className={`hud ${styles.credits}`}>
        {credited.map((a) => `${a.what.toLowerCase()}: ${a.by} (${a.license})`).join('. ')}.
      </p>
    </footer>
  );
}

const REGIONS = {
  intro: Intro,
  about: About,
  domains: Domains,
  projects: Projects,
  events: Events,
  writing: Writing,
  team: Team,
  contact: ContactRegion,
  end: End,
};

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

/**
 * @param {{ variant: 'film'|'still', onRegionFocus?: (sceneIndex: number, target: EventTarget) => void, subscribe?: (fn: (activeScene: number) => void) => () => void }} props
 */
export default function Semantic({ variant, onRegionFocus, subscribe }) {
  if (variant === 'still') {
    return (
      <div className={styles.still}>
        {Object.entries(REGIONS).map(([id, Region]) => (
          <div key={id} className={styles.frame} data-region={id}>
            <Region />
          </div>
        ))}
      </div>
    );
  }
  return <FilmRegions onRegionFocus={onRegionFocus} subscribe={subscribe} />;
}

function FilmRegions({ onRegionFocus, subscribe }) {
  const mobile = useIsMobile();
  const scenes = useMemo(() => layout(mobile), [mobile]);
  const total = totalVh(scenes);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe((active) => {
      const slots = rootRef.current?.querySelectorAll('[data-scene-index]') ?? [];
      slots.forEach((slot) => {
        slot.dataset.active = String(Number(slot.dataset.sceneIndex) === active);
      });
    });
  }, [subscribe]);

  return (
    <div ref={rootRef} className={styles.filmLayer}>
      {scenes.map((scene) => {
        const Region = scene.region ? REGIONS[scene.region] : null;
        return (
          <div
            key={scene.id}
            className={styles.slot}
            data-scene-index={scene.index}
            data-active="false"
            style={{ top: `${(scene.start / total) * 100}%`, height: `${(scene.length / total) * 100}%` }}
            onFocusCapture={(event) => onRegionFocus?.(scene.index, event.target)}
          >
            {Region ? (
              <div className={styles.panel} data-region={scene.region}>
                <Region />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
