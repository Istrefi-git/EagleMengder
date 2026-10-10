import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Search, X } from 'lucide-react';
import { HELP_CATEGORIES, TOOL_HELP } from '../lib/helpContent';
import type { HelpTopic } from '../lib/helpContent';

/** Fyller ut et emne som peker på et verktøy (`tool`) med tekstene fra TOOL_HELP, slik
 * at brukerveiledningen og hover-forklaringen alltid sier det samme. */
function resolve(topic: HelpTopic): HelpTopic & { shortcut?: string } {
  const t = topic.tool ? TOOL_HELP[topic.tool] : undefined;
  if (!t) return topic;
  return { ...topic, intro: t.summary, steps: t.steps, tip: t.tip, shortcut: t.shortcut };
}

function topicText(topic: HelpTopic): string {
  const r = resolve(topic);
  return [r.title, r.intro, ...(r.steps ?? []), ...(r.points ?? []), ...(r.keys ?? []).flat(), r.tip]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Brukerveiledningen: kategorier til venstre, emner til høyre, og et søkefelt som
 * leter på tvers av alle kategoriene. Innholdet ligger i lib/helpContent.ts. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [activeId, setActiveId] = useState(HELP_CATEGORIES[0].id);
  const [search, setSearch] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeId, search]);

  const q = search.trim().toLowerCase();
  const sections = q
    ? HELP_CATEGORIES.map((c) => ({ ...c, topics: c.topics.filter((t) => topicText(t).includes(q)) })).filter(
        (c) => c.topics.length > 0,
      )
    : HELP_CATEGORIES.filter((c) => c.id === activeId);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal help-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Hjelp – slik bruker du IstrefiCAD</h2>
          <button className="btn icon" onClick={onClose} title="Lukk (Esc)">
            <X size={16} />
          </button>
        </div>
        <div className="help-body">
          <nav className="help-nav">
            <div className="help-search">
              <Search size={14} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søk i hjelpen…"
                autoFocus
              />
            </div>
            {HELP_CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`help-cat ${!q && c.id === activeId ? 'active' : ''}`}
                onClick={() => {
                  setSearch('');
                  setActiveId(c.id);
                }}
              >
                <strong>{c.label}</strong>
                <span>{c.blurb}</span>
              </button>
            ))}
          </nav>
          <div className="help-content" ref={contentRef}>
            {sections.length === 0 && <p className="muted">Ingen treff på «{search}».</p>}
            {sections.map((c) => (
              <section key={c.id}>
                <h3 className="help-cat-title">{c.label}</h3>
                {!q && <p className="help-cat-blurb">{c.blurb}</p>}
                {c.topics.map((raw) => {
                  const t = resolve(raw);
                  return (
                    <article className="help-topic" key={t.title}>
                      <h4>
                        {t.title}
                        {t.shortcut && <kbd>{t.shortcut}</kbd>}
                      </h4>
                      {t.intro && <p>{t.intro}</p>}
                      {t.steps && (
                        <ol>
                          {t.steps.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                      )}
                      {t.points && (
                        <ul>
                          {t.points.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      )}
                      {t.keys && (
                        <dl className="help-keys">
                          {t.keys.map(([k, v]) => (
                            <div key={k}>
                              <dt>
                                <kbd>{k}</kbd>
                              </dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {t.tip && (
                        <p className="help-tip">
                          <Lightbulb size={14} />
                          <span>{t.tip}</span>
                        </p>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
