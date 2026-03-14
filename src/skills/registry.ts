/**
 * Built-in skills registry — hardcoded skill packs shipped with codemaxxing.
 * No network needed — everything is local.
 */

export interface RegistrySkill {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  prompt: string;
}

export const REGISTRY: RegistrySkill[] = [
  {
    name: "react-expert",
    description: "React/Next.js best practices, hooks, component patterns, performance",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["react", "nextjs", "frontend", "hooks", "components"],
    prompt: `# React & Next.js Expert

## Component Design
- Prefer function components with hooks over class components
- Keep components small and focused — one responsibility per component
- Extract custom hooks when logic is reused across 2+ components
- Use composition over prop drilling — leverage children, render props, or context
- Co-locate related files: Component.tsx, Component.test.tsx, Component.module.css

## Hooks Best Practices
- Follow the Rules of Hooks — only call at the top level, only in React functions
- useMemo for expensive computations, useCallback for stable function references passed as props
- Don't over-memoize — profile first, optimize second
- useRef for values that don't trigger re-renders (timers, previous values, DOM refs)
- Custom hooks should start with "use" and encapsulate a single concern

## State Management
- Start with local state (useState) — lift only when needed
- useReducer for complex state logic with multiple sub-values
- Context for truly global state (theme, auth, locale) — not for frequently updating data
- Consider Zustand or Jotai for medium-complexity state before reaching for Redux
- Avoid storing derived state — compute it during render

## Performance
- React.memo only for components that re-render with same props frequently
- Virtualize long lists (react-window, @tanstack/virtual)
- Lazy load routes and heavy components with React.lazy + Suspense
- Use the React DevTools Profiler to identify actual bottlenecks
- Avoid creating new objects/arrays in render — define outside or memoize

## Next.js Patterns
- Use Server Components by default — add "use client" only when needed
- Prefer server actions for mutations over API routes
- Use next/image for automatic image optimization
- Implement loading.tsx and error.tsx for each route segment
- Use generateStaticParams for static generation of dynamic routes

## Anti-Patterns to Avoid
- Don't use useEffect for data that can be computed during render
- Don't sync state with useEffect when derived state works
- Don't use index as key for lists that reorder or filter
- Don't put everything in a single global store
- Don't fetch data in useEffect without cleanup/cancellation
- Avoid prop drilling more than 2 levels deep
`,
  },
  {
    name: "python-pro",
    description: "Pythonic code, type hints, async, testing, virtual envs",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["python", "typing", "async", "testing", "backend"],
    prompt: `# Python Professional

## Pythonic Code
- Use list/dict/set comprehensions over manual loops when readable
- Prefer f-strings over .format() or % formatting
- Use enumerate() instead of manual index tracking
- Use zip() to iterate multiple sequences in parallel
- Leverage unpacking: a, b = tuple_val; first, *rest = items
- Use pathlib.Path over os.path for file operations
- Context managers (with statements) for resource management
- Use dataclasses or Pydantic models over raw dicts for structured data

## Type Hints
- Add type hints to all function signatures (parameters and return types)
- Use | union syntax (Python 3.10+) over Union: \`def f(x: int | None)\`
- Use TypeVar and Generic for type-safe generic functions/classes
- Use Protocol for structural subtyping (duck typing with type safety)
- Annotate collections: list[str], dict[str, int], not just list, dict
- Use TypeAlias for complex types: \`UserMap: TypeAlias = dict[str, list[User]]\`
- Use @overload for functions with different return types based on input

## Async Python
- Use asyncio for I/O-bound concurrency, not CPU-bound work
- Use \`async with\` for async context managers (aiohttp sessions, db connections)
- Use asyncio.gather() for concurrent async tasks
- Never mix sync and async I/O — use run_in_executor for legacy sync code
- Use asyncio.TaskGroup (3.11+) for structured concurrency
- Always handle cancellation in long-running async tasks

## Testing
- Use pytest over unittest — it's simpler and more powerful
- Name tests descriptively: test_create_user_with_duplicate_email_raises_error
- Use fixtures for setup/teardown, conftest.py for shared fixtures
- Use parametrize for testing multiple inputs/outputs
- Mock external dependencies (APIs, databases) at the boundary
- Use freezegun or time-machine for time-dependent tests
- Aim for testing behavior, not implementation details

## Project Structure
- Use pyproject.toml for project metadata and tool configuration
- Virtual environments: always use one (venv, uv, or poetry)
- Use ruff for linting and formatting (replaces flake8, black, isort)
- Structure: src/package_name/ layout for installable packages
- Pin dependencies with lock files (uv.lock, poetry.lock)
`,
  },
  {
    name: "typescript-strict",
    description: "Strict TS patterns, generics, utility types, type guards",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["typescript", "types", "generics", "strict", "javascript"],
    prompt: `# TypeScript Strict Mode Expert

## Strict Configuration
- Enable all strict flags: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
- Never use \`any\` — use \`unknown\` and narrow with type guards
- Prefer \`as const\` assertions over widening literals
- Enable \`verbatimModuleSyntax\` for explicit type-only imports

## Type Design
- Use discriminated unions over optional properties for state variants
- Prefer interfaces for object shapes, type aliases for unions/intersections
- Use branded/opaque types for semantic distinction: \`type UserId = string & { __brand: "UserId" }\`
- Make impossible states unrepresentable with union types
- Use \`satisfies\` operator to validate types without widening
- Template literal types for string patterns: \`type Route = \`/\${string}\`\`

## Generics
- Name generic parameters descriptively: TItem over T when context helps
- Use constraints: \`<T extends Record<string, unknown>>\`
- Use conditional types for type-level branching: \`T extends string ? A : B\`
- Infer types in conditional types: \`T extends Promise<infer U> ? U : T\`
- Use mapped types for transformations: \`{ [K in keyof T]: Readonly<T[K]> }\`
- Use the \`NoInfer\` utility to prevent inference in specific positions

## Utility Types
- Partial<T>, Required<T>, Readonly<T> for property modifiers
- Pick<T, K>, Omit<T, K> for object subsets
- Record<K, V> for typed dictionaries
- Extract<T, U>, Exclude<T, U> for union manipulation
- ReturnType<T>, Parameters<T> for function type extraction
- NonNullable<T> to strip null/undefined from unions

## Type Guards & Narrowing
- Prefer \`in\` operator narrowing: \`if ("kind" in value)\`
- Write custom type guards: \`function isUser(v: unknown): v is User\`
- Use assertion functions: \`function assertDefined<T>(v: T | undefined): asserts v is T\`
- Exhaustive checks with \`never\`: \`const _exhaustive: never = value\`
- Use optional chaining (?.) and nullish coalescing (??) over manual checks

## Anti-Patterns
- Never use \`as\` casts to silence errors — fix the types instead
- Don't use \`!\` non-null assertion — use proper null checks
- Don't use \`object\` type — use \`Record<string, unknown>\` or a specific interface
- Don't use enums — use \`as const\` objects or union types
- Don't use \`Function\` type — use specific function signatures
- Avoid \`@ts-ignore\` — use \`@ts-expect-error\` with an explanation if truly needed
`,
  },
  {
    name: "api-designer",
    description: "REST/GraphQL API design, OpenAPI, auth patterns, error handling",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["api", "rest", "graphql", "openapi", "backend", "auth"],
    prompt: `# API Design Expert

## REST Design Principles
- Use nouns for resources, HTTP verbs for actions: GET /users, POST /users, DELETE /users/:id
- Use plural nouns for collections: /users not /user
- Nest resources for relationships: /users/:id/posts (max 2 levels deep)
- Use query parameters for filtering, sorting, pagination: ?status=active&sort=-created_at&page=2
- Return appropriate HTTP status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 404 Not Found
- Use PATCH for partial updates, PUT for full replacements
- Version your API: /v1/users or Accept: application/vnd.api+json;version=1

## Response Design
- Consistent response envelope: { data, meta, errors }
- Pagination: cursor-based for real-time data, offset for simple lists
- Include total count in paginated responses: { data: [...], meta: { total: 142, page: 2 } }
- Use ISO 8601 for dates: "2024-01-15T10:30:00Z"
- Return created/updated resources in POST/PATCH responses
- HATEOAS links for discoverability when appropriate

## Error Handling
- Structured error responses: { error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }
- Use machine-readable error codes alongside human-readable messages
- Include field-level errors for validation: { field: "email", message: "already taken" }
- Never expose stack traces or internal details in production
- Rate limit errors should include retry-after headers
- 422 for validation errors, 409 for conflicts, 429 for rate limiting

## Authentication & Security
- Use OAuth 2.0 / OIDC for user authentication
- API keys for service-to-service, JWTs for user sessions
- Short-lived access tokens (15min) + refresh tokens (7 days)
- Always validate and sanitize input — never trust the client
- CORS: whitelist specific origins, never use wildcard in production
- Rate limiting: per-user and per-IP, with appropriate headers

## OpenAPI / Documentation
- Write OpenAPI 3.1 specs for all endpoints
- Include request/response examples for every endpoint
- Document error responses, not just success cases
- Use $ref for reusable schemas (User, Error, Pagination)
- Generate client SDKs from OpenAPI specs when possible

## Anti-Patterns
- Don't use verbs in URLs: /getUsers → GET /users
- Don't return 200 for errors — use proper status codes
- Don't nest resources more than 2 levels deep
- Don't use POST for everything — use proper HTTP methods
- Don't expose database IDs if you can use UUIDs or slugs
- Don't return all fields by default — support field selection
`,
  },
  {
    name: "test-engineer",
    description: "Unit/integration/e2e testing, TDD, mocking, coverage strategies",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["testing", "tdd", "jest", "vitest", "e2e", "mocking"],
    prompt: `# Test Engineering Expert

## Testing Philosophy
- Test behavior, not implementation — tests should survive refactors
- Follow the testing pyramid: many unit tests, fewer integration, fewest e2e
- Write the test first (TDD) when the interface is clear
- Each test should test one thing and have a descriptive name
- Tests are documentation — they should be readable without comments

## Unit Testing
- Test pure functions exhaustively — they're the easiest to test
- Use the Arrange-Act-Assert (AAA) pattern
- Test edge cases: empty inputs, null/undefined, boundary values, error paths
- Keep tests independent — no shared mutable state between tests
- Use test.each / parametrize for data-driven tests
- Prefer real implementations over mocks when feasible

## Mocking Strategy
- Mock at the boundary: external APIs, databases, file system, time
- Don't mock what you don't own — wrap third-party code and mock your wrapper
- Use dependency injection to make code testable
- Prefer stubs (return canned values) over spies (track calls) when possible
- Reset mocks between tests to prevent leakage
- Use MSW (Mock Service Worker) for API mocking in frontend tests

## Integration Testing
- Test the contract between components/services
- Use real databases with test containers (testcontainers)
- Test API endpoints with supertest or similar HTTP testing libraries
- Verify database state changes, not just response codes
- Test error scenarios: network failures, timeouts, invalid data

## E2E Testing
- Use Playwright or Cypress for browser-based e2e tests
- Test critical user journeys, not every feature
- Use data-testid attributes for stable selectors
- Implement retry logic for flaky network-dependent tests
- Run e2e tests in CI against a staging environment
- Keep e2e tests fast — parallelize and minimize setup

## Coverage & Quality
- Aim for 80%+ line coverage, but don't chase 100%
- Focus coverage on business logic, not boilerplate
- Use mutation testing (Stryker) to verify test effectiveness
- Track coverage trends — decreasing coverage should block PRs
- Snapshot tests: use sparingly, review carefully, update intentionally

## Anti-Patterns
- Don't test private methods directly — test through public interface
- Don't write tests that duplicate the implementation logic
- Don't use sleep/delays — use waitFor or polling utilities
- Don't share state between tests or depend on test execution order
- Don't mock everything — over-mocking makes tests meaningless
- Don't write flaky tests — fix or delete them
`,
  },
  {
    name: "doc-writer",
    description: "README, API docs, JSDoc/TSDoc, changelogs, clear writing",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["documentation", "readme", "jsdoc", "tsdoc", "changelog", "writing"],
    prompt: `# Documentation Expert

## README Structure
- Start with a one-line description of what the project does
- Include a quick-start section: install → configure → run (under 5 steps)
- Add badges: CI status, npm version, license, coverage
- Show a screenshot or GIF for visual projects
- List key features as bullet points (5-8 max)
- Include a "Contributing" section with setup instructions
- License section at the bottom

## Code Documentation (JSDoc/TSDoc)
- Document public APIs — skip obvious implementations
- Include @param, @returns, @throws, and @example tags
- Write descriptions that explain WHY, not WHAT (the code shows what)
- Use @deprecated with migration instructions
- Document non-obvious behavior, edge cases, and gotchas
- Keep descriptions concise — one sentence if possible
- Use @link to reference related functions or types

## API Documentation
- Document every endpoint with: method, path, description, parameters, response
- Include request/response examples with realistic data
- Document error responses and status codes
- Group endpoints by resource/domain
- Use tools: Swagger/OpenAPI, Redoc, or Stoplight
- Keep docs in sync with code — generate from source when possible

## Changelog
- Follow Keep a Changelog format (keepachangelog.com)
- Categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Write entries from the user's perspective, not the developer's
- Link to relevant PRs and issues
- Include migration guides for breaking changes
- Use semantic versioning (semver.org)

## Writing Style
- Use active voice: "Configure the database" not "The database should be configured"
- Be direct and concise — cut filler words
- Use second person: "you" not "the user"
- Define acronyms on first use
- Use consistent terminology throughout
- Prefer bullet points over long paragraphs
- Include code examples for anything non-trivial

## Anti-Patterns
- Don't write docs that restate the function name: "getName gets the name"
- Don't leave TODO or placeholder docs in production code
- Don't document every line — trust readers to understand basic code
- Don't use jargon without explanation
- Don't write docs once and forget — keep them updated
- Don't put configuration details in comments — use docs or config files
`,
  },
  {
    name: "security-audit",
    description: "OWASP, dependency scanning, secrets, auth vulnerabilities",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["security", "owasp", "auth", "vulnerabilities", "audit"],
    prompt: `# Security Audit Expert

## Input Validation
- Validate ALL user input on the server side — client validation is for UX only
- Use allowlists over denylists for input validation
- Sanitize HTML to prevent XSS — use DOMPurify or equivalent
- Parameterize all database queries — never concatenate user input into SQL
- Validate file uploads: check MIME type, size limits, and file content (not just extension)
- Rate limit all public endpoints, especially authentication
- Validate Content-Type headers to prevent CSRF via form submission

## Authentication & Authorization
- Hash passwords with bcrypt, scrypt, or Argon2 — never MD5/SHA
- Implement account lockout after N failed attempts
- Use CSRF tokens for state-changing requests in web apps
- Validate JWTs properly: check signature, expiration, issuer, audience
- Never store sensitive data in JWTs — they're base64 encoded, not encrypted
- Implement proper session invalidation on logout
- Use httpOnly, secure, sameSite flags on session cookies
- Apply principle of least privilege — check permissions on every request

## Secrets Management
- Never commit secrets to version control — use .env files and .gitignore
- Use environment variables or secret managers (Vault, AWS SSM, Doppler)
- Rotate secrets regularly and after any suspected compromise
- Scan repos for leaked secrets: gitleaks, truffleHog, git-secrets
- Use different credentials per environment (dev, staging, prod)
- Never log sensitive data (passwords, tokens, PII)

## Dependency Security
- Run npm audit / pip-audit / cargo audit regularly
- Pin dependency versions — use lockfiles
- Enable Dependabot or Renovate for automated updates
- Audit transitive dependencies, not just direct ones
- Remove unused dependencies to reduce attack surface
- Review dependency changelogs before major version updates

## OWASP Top 10 Checklist
- A01 Broken Access Control: verify authorization on every endpoint
- A02 Cryptographic Failures: use TLS everywhere, strong algorithms
- A03 Injection: parameterize queries, validate input, escape output
- A04 Insecure Design: threat model before building
- A05 Security Misconfiguration: disable debug mode, remove defaults
- A06 Vulnerable Components: keep dependencies updated
- A07 Auth Failures: strong passwords, MFA, proper session management
- A08 Data Integrity: verify software updates, use SRI for CDN scripts
- A09 Logging Failures: log security events, monitor for anomalies
- A10 SSRF: validate URLs, restrict outbound requests, use allowlists

## Anti-Patterns
- Don't roll your own crypto — use battle-tested libraries
- Don't trust client-side validation as your only defense
- Don't expose detailed error messages to end users
- Don't use GET requests for state-changing operations
- Don't store passwords in plaintext or reversible encryption
- Don't disable security features "for development" and forget to re-enable
`,
  },
  {
    name: "devops-toolkit",
    description: "Docker, CI/CD, Terraform, K8s, monitoring, deployment",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["docker", "cicd", "terraform", "kubernetes", "monitoring", "devops"],
    prompt: `# DevOps Toolkit Expert

## Docker
- Use multi-stage builds to minimize image size
- Pin base image versions: node:20-slim not node:latest
- Order Dockerfile layers by change frequency (least → most frequent)
- COPY package*.json first, then npm install, then COPY source (layer caching)
- Use .dockerignore to exclude node_modules, .git, tests, docs
- Run as non-root user: USER node
- Use HEALTHCHECK for production containers
- One process per container — use docker compose for multi-service apps

## CI/CD Pipelines
- Fast feedback: lint → type check → unit tests → build → integration tests → deploy
- Parallelize independent jobs (lint + typecheck + test can run simultaneously)
- Cache dependencies between runs (npm cache, Docker layer cache)
- Use matrix builds for cross-platform/version testing
- Gate deployments on test passage — never deploy broken code
- Keep CI config DRY — use reusable workflows/templates
- Pin action/plugin versions for reproducibility
- Run security scans in CI: SAST, dependency audit, container scanning

## Infrastructure as Code (Terraform)
- Use modules for reusable infrastructure components
- Remote state with locking (S3 + DynamoDB, Terraform Cloud)
- Separate state files per environment (dev, staging, prod)
- Use terraform plan before apply — review changes carefully
- Tag all resources for cost tracking and ownership
- Use data sources to reference existing infrastructure
- Validate with terraform validate and tflint before applying

## Kubernetes
- Use Deployments for stateless apps, StatefulSets for stateful
- Set resource requests AND limits for all containers
- Use ConfigMaps for config, Secrets for sensitive data
- Implement readiness and liveness probes
- Use namespaces to isolate environments/teams
- HPA (Horizontal Pod Autoscaler) for auto-scaling
- Use Network Policies to restrict pod-to-pod communication
- Rolling update strategy with proper maxUnavailable/maxSurge

## Monitoring & Observability
- Three pillars: metrics (Prometheus), logs (Loki/ELK), traces (Jaeger/Tempo)
- Alert on symptoms (error rate, latency), not causes (CPU, memory)
- Use structured logging (JSON) with consistent fields
- Implement health check endpoints: /health, /ready
- Dashboard essentials: request rate, error rate, latency (p50/p95/p99), saturation
- Set up PagerDuty/Opsgenie for critical alerts, Slack for warnings
- Use SLOs/SLIs to measure reliability objectively

## Anti-Patterns
- Don't use :latest tags in production — pin versions
- Don't store state in containers — they're ephemeral
- Don't skip staging — always test in a production-like environment
- Don't hardcode config — use environment variables or config maps
- Don't ignore failed CI — fix or revert immediately
- Don't alert on everything — alert fatigue leads to ignored alerts
`,
  },
];
