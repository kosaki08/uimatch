# Security Policy

## Supported Versions

uiMatch is currently in experimental/pre-release stage (0.x versions). Security updates will be provided for the latest published version.

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in uiMatch, please report it by emailing:

**kazunoriosaki@gmail.com**

Please include the following information in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: You will receive a response within 48 hours acknowledging your report.
- **Investigation**: We will investigate the issue and determine its severity and impact.
- **Updates**: We will keep you informed about the progress of the fix.
- **Disclosure**: Once a fix is available, we will coordinate with you on the disclosure timeline.

### Security Best Practices

When using uiMatch:

- **Figma Tokens**: Store Figma API tokens securely using environment variables
- **CI/CD**: Use GitHub Secrets or equivalent secure storage for tokens
- **Local Development**: Never commit `.env` files or expose tokens in code
- **Browser Automation**: Be cautious when running Playwright tests against production environments

## Scope

Security issues we consider in scope:

- Authentication/authorization bypass in Figma API integration
- Exposure of sensitive tokens or credentials
- Command injection or code execution vulnerabilities
- Dependency vulnerabilities with security patches available

Out of scope:

- Issues in third-party dependencies without available patches
- Theoretical vulnerabilities without proof of concept
- Social engineering attacks

Thank you for helping keep uiMatch and its users safe!
