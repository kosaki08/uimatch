import Heading from '@theme/Heading';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Pixel-Perfect Comparison',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Compare Figma designs with actual implementations using pixel-level color differences (ΔE),
        dimensional accuracy, and layout discrepancies. Get numerical scores with annotated
        screenshots.
      </>
    ),
  },
  {
    title: 'Quality Gates & Profiles',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Flexible quality gate profiles from pixel-perfect to lenient. Configure thresholds for{' '}
        <code>pixelDiffRatio</code>, <code>deltaE</code>, and more to match your workflow.
      </>
    ),
  },
  {
    title: 'CI/CD Ready',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Built for automation with GitHub Actions support, exit codes, and batch suite mode.
        Integrates seamlessly with Playwright for browser-based testing.
      </>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
