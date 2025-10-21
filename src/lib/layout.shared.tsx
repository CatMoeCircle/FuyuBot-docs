import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
            <img
            src="https://avatars.githubusercontent.com/u/152006220?s=200&v=4"
            alt="Logo"
            width={24}
            height={24}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
            aria-label="Logo"
            loading="lazy"
            />
          Fuyu Docs
        </>
      ),
    },
    // see https://fumadocs.dev/docs/ui/navigation/links
    links: [],
    githubUrl: 'https://github.com/CatMoeCircle/Fuyu_TDBot',
  }
}
