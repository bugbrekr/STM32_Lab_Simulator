// Small Eclipse-style icons drawn inline.
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 16 16', style: { verticalAlign: 'middle', flexShrink: 0 } as const };
  switch (name) {
    case 'build':
      return (
        <svg {...common}>
          <rect x="1" y="9" width="8" height="3" rx="1" transform="rotate(-40 5 10)" fill="#8b5a2b" />
          <rect x="7" y="2" width="7" height="5" rx="1" transform="rotate(-40 10 4)" fill="#7a7f87" />
        </svg>
      );
    case 'run':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="#2e9e44" />
          <polygon points="6,4.5 11.5,8 6,11.5" fill="#fff" />
        </svg>
      );
    case 'debug':
      return (
        <svg {...common}>
          <ellipse cx="8" cy="9" rx="4" ry="5" fill="#5c8a3a" />
          <circle cx="8" cy="4" r="2.5" fill="#5c8a3a" />
          <path d="M2 6 L5 8 M2 11 L4.5 10 M14 6 L11 8 M14 11 L11.5 10" stroke="#5c8a3a" strokeWidth="1.3" />
          <line x1="8" y1="5" x2="8" y2="14" stroke="#2f4a1f" strokeWidth="0.8" />
        </svg>
      );
    case 'resume':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="2.5" height="10" fill="#3a7d2a" />
          <polygon points="6,3 14,8 6,13" fill="#3a9d2a" />
        </svg>
      );
    case 'suspend':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="3.5" height="10" fill="#d6a31c" />
          <rect x="9.5" y="3" width="3.5" height="10" fill="#d6a31c" />
        </svg>
      );
    case 'terminate':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" fill="#d33" rx="1" />
        </svg>
      );
    case 'stepinto':
      return (
        <svg {...common}>
          <path d="M3 3 H 9 V 11" stroke="#d6a31c" strokeWidth="2" fill="none" />
          <polygon points="6,10 12,10 9,14" fill="#d6a31c" />
          <rect x="3" y="13" width="3" height="2" fill="#555" />
        </svg>
      );
    case 'stepover':
      return (
        <svg {...common}>
          <path d="M2 10 C 2 3, 13 3, 13 9" stroke="#d6a31c" strokeWidth="2" fill="none" />
          <polygon points="10,8 15,8 13,12" fill="#d6a31c" />
          <rect x="1" y="12" width="5" height="2" fill="#555" />
        </svg>
      );
    case 'stepreturn':
      return (
        <svg {...common}>
          <path d="M8 13 V 4" stroke="#d6a31c" strokeWidth="2" />
          <polygon points="4,6 12,6 8,1" fill="#d6a31c" />
          <rect x="3" y="13" width="10" height="2" fill="#555" />
        </svg>
      );
    case 'reset':
      return (
        <svg {...common}>
          <path d="M12.5 8 A 4.5 4.5 0 1 1 10 4" stroke="#2a7bd6" strokeWidth="2" fill="none" />
          <polygon points="9,1 13,4 9,6" fill="#2a7bd6" />
        </svg>
      );
    case 'save':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="12" height="12" rx="1" fill="#4a72b8" />
          <rect x="4" y="2" width="8" height="5" fill="#fff" />
          <rect x="5" y="9" width="6" height="5" fill="#d9e2f2" />
        </svg>
      );
    case 'new':
      return (
        <svg {...common}>
          <path d="M3 1 H 10 L 13 4 V 15 H 3 Z" fill="#fff" stroke="#888" />
          <path d="M10 1 V 4 H 13" fill="none" stroke="#888" />
          <circle cx="12" cy="12" r="3.5" fill="#f2c94c" stroke="#b8901f" />
        </svg>
      );
    case 'project':
      return (
        <svg {...common}>
          <path d="M1 4 H 6 L 7.5 5.5 H 15 V 14 H 1 Z" fill="#e8c35a" stroke="#a88a2a" />
          <text x="9.5" y="13" fontSize="6" fontWeight="700" fill="#03234b">
            IDE
          </text>
        </svg>
      );
    case 'folder':
    case 'srcfolder':
      return (
        <svg {...common}>
          <path d="M1 4 H 6 L 7.5 5.5 H 15 V 14 H 1 Z" fill={name === 'srcfolder' ? '#e8c35a' : '#f0d27a'} stroke="#a88a2a" />
          {name === 'srcfolder' && <rect x="10" y="9" width="5" height="5" fill="#6b8fd6" />}
        </svg>
      );
    case 'includes':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" fill="#f6efe0" stroke="#a88a2a" />
          <path d="M4 6 H 12 M4 8.5 H 12 M4 11 H 9" stroke="#999" />
        </svg>
      );
    case 'cfile':
      return (
        <svg {...common}>
          <path d="M3 1 H 10 L 13 4 V 15 H 3 Z" fill="#fff" stroke="#888" />
          <text x="5" y="12" fontSize="8" fontWeight="800" fill="#3f6bd6">
            c
          </text>
        </svg>
      );
    case 'hfile':
      return (
        <svg {...common}>
          <path d="M3 1 H 10 L 13 4 V 15 H 3 Z" fill="#fff" stroke="#888" />
          <text x="5" y="12" fontSize="8" fontWeight="800" fill="#8a3fd6">
            h
          </text>
        </svg>
      );
    case 'sfile':
      return (
        <svg {...common}>
          <path d="M3 1 H 10 L 13 4 V 15 H 3 Z" fill="#fff" stroke="#888" />
          <text x="5" y="12" fontSize="8" fontWeight="800" fill="#c86a1a">
            s
          </text>
        </svg>
      );
    case 'ioc':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="14" height="14" rx="2" fill="#03234b" />
          <text x="2.3" y="11" fontSize="6.5" fontWeight="800" fill="#fff">
            MX
          </text>
        </svg>
      );
    case 'console':
      return (
        <svg {...common}>
          <rect x="1" y="2" width="14" height="12" rx="1" fill="#333" />
          <path d="M3 5 L 6 7.5 L 3 10" stroke="#9f9" strokeWidth="1.3" fill="none" />
          <path d="M7 11 H 12" stroke="#9f9" strokeWidth="1.3" />
        </svg>
      );
    case 'clear':
      return (
        <svg {...common}>
          <path d="M3 3 L 13 13 M13 3 L 3 13" stroke="#999" strokeWidth="2" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="10" height="7" rx="1" fill="#b48a2a" />
          <path d="M5 7 V 5 A 3 3 0 0 1 11 5 V 7" stroke="#b48a2a" strokeWidth="1.6" fill="none" />
        </svg>
      );
    case 'plug':
      return (
        <svg {...common}>
          <path d="M5 1 V 5 M11 1 V 5" stroke="#555" strokeWidth="1.6" />
          <rect x="3" y="5" width="10" height="5" rx="1" fill="#666" />
          <path d="M8 10 V 15" stroke="#555" strokeWidth="2" />
        </svg>
      );
    case 'board':
      return (
        <svg {...common}>
          <rect x="1" y="2" width="14" height="12" rx="1.5" fill="#0f7a4f" />
          <rect x="5" y="4" width="6" height="8" fill="#f4f4f4" />
          <rect x="7" y="7" width="2" height="2" fill="#222" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 1 H 10 L 13 4 V 15 H 3 Z" fill="#fff" stroke="#888" />
        </svg>
      );
  }
}
