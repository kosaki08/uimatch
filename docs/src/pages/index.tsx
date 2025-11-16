import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/getting-started">
            Get Started 🚀
          </Link>
        </div>
      </div>
    </header>
  );
}

function ExperimentalNotice() {
  return (
    <div className="container" style={{ marginTop: '2rem' }}>
      <div
        style={{
          backgroundColor: 'var(--ifm-color-warning-contrast-background)',
          border: '1px solid var(--ifm-color-warning-dark)',
          borderRadius: '0.5rem',
          padding: '1rem 1.5rem',
          marginBottom: '2rem',
        }}
      >
        <strong>⚠️ Early Development (0.x):</strong> uiMatch is currently in early development. APIs
        and behavior may change without notice and are not production-ready.
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Figma-to-implementation visual QA: pixel diffs, quality gates, and anchor-based selectors."
    >
      <HomepageHeader />
      <ExperimentalNotice />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
