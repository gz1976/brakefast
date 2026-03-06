interface Section {
  id: string;
  label: string;
}

interface Props {
  sections: Section[];
  activeId: string;
  onNavigate: (id: string) => void;
}

export function NavTabs({ sections, activeId, onNavigate }: Props) {
  return (
    <nav className="nav-tabs">
      <div className="nav-tabs-inner">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`nav-pill${activeId === s.id ? ' active' : ''}`}
            onClick={() => onNavigate(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
