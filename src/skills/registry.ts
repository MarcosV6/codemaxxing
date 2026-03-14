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
  {
    name: "nextjs-app",
    description: "Next.js App Router, Server/Client Components, server actions, caching, streaming",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["nextjs", "react", "app-router", "server-components", "streaming"],
    prompt: `# Next.js App Router Expert

## Server Components vs Client Components
- Default to Server Components — they run on the server, ship zero JS to the client
- Add "use client" only when you need: useState, useEffect, event handlers, browser APIs
- Keep "use client" boundaries as low in the tree as possible — wrap only the interactive leaf
- Server Components can import Client Components, but NOT the reverse
- Pass server data to Client Components as serializable props — no functions, no classes
- Use composition: Server Component fetches data, passes it to a Client Component for interactivity

## Route Handlers & Server Actions
- Use server actions ("use server") for mutations — forms, data writes, revalidation
- Prefer server actions over API route handlers for app-internal mutations
- Use route.ts (GET/POST/PUT/DELETE) for webhooks, external API consumers, and streaming responses
- Always validate input in server actions with Zod or similar — they're public endpoints
- Call revalidatePath() or revalidateTag() after mutations to bust the cache
- Use useActionState (React 19) for form state + pending UI, not manual useState

## Routing & Layouts
- Use layout.tsx for shared UI that persists across navigations (navbars, sidebars)
- Use template.tsx instead of layout.tsx when you need fresh state on every navigation
- Implement loading.tsx per route segment for instant loading UI via Suspense
- Implement error.tsx per route segment — wraps in an ErrorBoundary automatically
- Use not-found.tsx for custom 404 pages, call notFound() to trigger programmatically
- Route groups (parentheses) for organizing without affecting URL: (marketing)/about/page.tsx
- Parallel routes (@modal) and intercepting routes ((..)photo) for modals and feeds

## Data Fetching & Caching
- Fetch in Server Components directly — no useEffect, no client-side fetching for initial data
- Use the extended fetch options: \`fetch(url, { next: { revalidate: 3600, tags: ["posts"] } })\`
- unstable_cache or "use cache" directive for caching non-fetch operations (DB queries)
- Understand the cache layers: Request Memoization → Data Cache → Full Route Cache
- Use \`export const dynamic = "force-dynamic"\` to opt out of static rendering per route
- generateStaticParams for static generation of dynamic routes at build time

## Streaming & Suspense
- Wrap slow data fetches in <Suspense> with a fallback to stream the page progressively
- Use loading.tsx for route-level Suspense — it wraps page.tsx automatically
- Multiple <Suspense> boundaries let fast content appear while slow content loads
- Streaming works out of the box — no special config needed with App Router

## Metadata & SEO
- Export metadata object or generateMetadata function from page.tsx and layout.tsx
- Use generateMetadata for dynamic metadata (fetching title from DB)
- Metadata merges from layout → page, with page taking precedence
- Add opengraph-image.tsx and twitter-image.tsx for dynamic OG images
- Use sitemap.ts and robots.ts for programmatic SEO files

## Middleware
- Use middleware.ts at the project root for auth checks, redirects, A/B testing, geo-routing
- Middleware runs on the Edge — keep it lightweight, no heavy computation or DB queries
- Use NextResponse.next() to continue, NextResponse.redirect() to redirect, NextResponse.rewrite() to rewrite
- Match routes with the config.matcher array — don't run middleware on static assets

## Anti-Patterns
- Don't "use client" on layout.tsx — it defeats the purpose of Server Component layouts
- Don't fetch data on the client when you can fetch in a Server Component
- Don't use useEffect for data fetching in the App Router — use Server Components or server actions
- Don't mix Pages Router patterns (getServerSideProps) with App Router
- Don't put all components in a single "use client" boundary — isolate interactivity
- Don't forget to handle the loading and error states per route segment
`,
  },
  {
    name: "tailwind-ui",
    description: "Tailwind CSS, Shadcn UI, Radix primitives, responsive design, dark mode",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["tailwind", "shadcn", "radix", "css", "ui", "design-system"],
    prompt: `# Tailwind CSS & Shadcn UI Expert

## Utility-First Patterns
- Build UI with utility classes directly — avoid creating CSS files unless truly necessary
- Group related utilities logically: layout → spacing → sizing → typography → colors → effects
- Use arbitrary values sparingly: \`w-[327px]\` is a sign you need a design token or a different approach
- Prefer Tailwind's spacing scale (p-4, m-6) over arbitrary values for consistency
- Use @apply only in base layer for truly repeated patterns (btn, input) — not for components
- Prefer component extraction (React/Svelte/Vue components) over @apply for reuse

## Responsive Design
- Mobile-first: write base styles for mobile, override with sm:, md:, lg:, xl:, 2xl:
- Breakpoints: sm(640) md(768) lg(1024) xl(1280) 2xl(1536) — learn them
- Use container mx-auto for centered max-width layouts
- Responsive grids: \`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6\`
- Hide/show elements responsively: \`hidden md:block\` or \`md:hidden\`
- Use responsive typography: \`text-sm md:text-base lg:text-lg\`

## Dark Mode
- Use the "class" dark mode strategy for user-controlled toggling
- Apply dark variants: \`bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100\`
- Use CSS custom properties with Tailwind for theme-aware colors
- Define semantic color names in tailwind.config: primary, secondary, muted, accent
- Use Shadcn's built-in dark mode — it uses CSS variables under the hood
- Test both modes — don't forget hover/focus states in dark mode

## Shadcn UI & Radix Primitives
- Install Shadcn components individually: \`npx shadcn@latest add button dialog\`
- Components live in your codebase (src/components/ui/) — customize them directly
- Use the cn() helper (clsx + tailwind-merge) for conditional + overridable classes
- cn() pattern: \`cn("base classes", conditional && "conditional-class", className)\`
- Radix provides unstyled accessible primitives — Shadcn adds Tailwind styles on top
- Always pass className through to the root element of custom components for composability

## Component Composition
- Build complex components by composing Shadcn primitives: Dialog + Form + Button
- Use Radix's compound component pattern: \`<Select><SelectTrigger><SelectContent>...</SelectContent></SelectTrigger></Select>\`
- Use cva (class-variance-authority) for multi-variant components: size, color, state
- Pattern: \`const buttonVariants = cva("base", { variants: { size: { sm: "h-8", lg: "h-12" } } })\`
- Extend Shadcn components by wrapping them, not by modifying the generated code (easier upgrades)
- Use Slot from Radix (asChild prop) to merge props onto child elements

## Accessibility
- Shadcn/Radix components handle ARIA attributes, keyboard navigation, and focus management
- Don't remove or override ARIA roles/attributes added by Radix primitives
- Use sr-only class for screen-reader-only text
- Ensure sufficient color contrast — Tailwind's default palette mostly passes WCAG AA
- Test with keyboard navigation: Tab, Enter, Escape, Arrow keys should all work

## Anti-Patterns
- Don't fight Tailwind by writing custom CSS for things utilities already handle
- Don't create deeply nested className strings — extract components instead
- Don't use inline styles alongside Tailwind — pick one approach
- Don't ignore the cn() helper — raw string concatenation breaks with conflicting utilities
- Don't copy-paste Shadcn components without understanding the underlying Radix primitives
- Don't use arbitrary values for spacing when a Tailwind scale value is close enough
- Don't forget to import Tailwind's base/components/utilities layers in your CSS entry point
`,
  },
  {
    name: "svelte-kit",
    description: "Svelte 5 runes, SvelteKit routing, load functions, form actions, SSR/SSG",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["svelte", "sveltekit", "runes", "ssr", "frontend"],
    prompt: `# Svelte 5 & SvelteKit Expert

## Svelte 5 Runes
- Use $state() for reactive state: \`let count = $state(0)\` — replaces the old \`let count = 0\` reactivity
- Use $derived() for computed values: \`let doubled = $derived(count * 2)\` — replaces $: reactive labels
- Use $derived.by() for multi-line derivations: \`let total = $derived.by(() => { /* compute */ return val })\`
- Use $effect() for side effects: replaces onMount + $: reactive statements that cause side effects
- $effect runs after DOM update — use $effect.pre() if you need to run before DOM update
- Use $props() to declare component props: \`let { name, age = 25 }: Props = $props()\`
- Use $bindable() for two-way bindable props: \`let { value = $bindable() }: Props = $props()\`
- $inspect() for debugging reactive values — like console.log but re-runs when values change

## Component Patterns
- Svelte components are .svelte files with <script>, markup, and <style> sections
- Use {#snippet name(params)} for reusable markup blocks within a component (replaces slots)
- Use {@render snippetName(args)} to render snippets
- Children content is received as a children snippet: \`let { children }: Props = $props()\` then {@render children?.()}
- Use \`<svelte:component this={Component}\` for dynamic components
- Scoped styles by default — styles in <style> only affect the current component
- Use :global() sparingly for styles that must escape component scope

## SvelteKit Routing
- File-based routing: src/routes/about/+page.svelte → /about
- Dynamic params: src/routes/users/[id]/+page.svelte → /users/123
- Layout nesting: +layout.svelte wraps all child routes automatically
- Use +page.ts for universal load (runs server + client), +page.server.ts for server-only load
- Use +error.svelte for error pages, +layout.server.ts for layout-level data loading
- Group routes without URL impact: (group)/route/+page.svelte
- Rest params: [...slug]/+page.svelte catches all remaining path segments

## Load Functions
- Load functions in +page.ts export a load function that returns data as props
- Access params, url, fetch (SvelteKit's enhanced fetch with credentials), and parent data
- Use depends() to declare custom invalidation keys: \`depends('app:posts')\`
- Call invalidate('app:posts') or invalidateAll() to re-run load functions
- Server load functions (+page.server.ts) can access DB, env vars, and secrets directly
- Data flows: +layout.server.ts → +layout.ts → +page.server.ts → +page.ts → component

## Form Actions
- Define actions in +page.server.ts: \`export const actions = { default: async ({ request }) => { ... } }\`
- Use <form method="POST"> — SvelteKit handles it without JS (progressive enhancement)
- Named actions: \`<form method="POST" action="?/create">\` maps to \`actions: { create: async () => {} }\`
- Use enhance action for progressive enhancement: \`<form method="POST" use:enhance>\`
- Return validation errors with fail(): \`return fail(400, { email, error: "Invalid email" })\`
- Access returned data in the page via $page.form or the form prop from load

## SSR, SSG & Prerendering
- SSR is on by default — pages render on the server, then hydrate on the client
- Prerender static pages: \`export const prerender = true\` in +page.ts or +layout.ts
- Use adapter-static for full SSG (all pages prerendered)
- Disable SSR for SPA pages: \`export const ssr = false\` — use only when necessary
- Use adapter-node for Node server, adapter-vercel/adapter-netlify for serverless

## Anti-Patterns
- Don't use $: reactive labels in Svelte 5 — migrate to $state, $derived, $effect
- Don't mutate $state values indirectly without assignment — Svelte 5 uses proxies but keep mutations explicit
- Don't use $effect for derived values — use $derived instead
- Don't put secrets or DB calls in +page.ts (universal) — use +page.server.ts for server-only code
- Don't forget use:enhance on forms — without it, you lose SvelteKit's progressive enhancement
- Don't create stores for local component state — $state() rune handles it
`,
  },
  {
    name: "react-native",
    description: "Expo, React Navigation, platform-specific code, performance, EAS builds",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["react-native", "expo", "mobile", "ios", "android", "navigation"],
    prompt: `# React Native & Expo Expert

## Expo Workflow
- Start with Expo for new projects — it handles native config, builds, and OTA updates
- Use Expo Router for file-based routing (built on React Navigation)
- Use expo-dev-client for custom native modules during development
- Use EAS Build for cloud builds: \`eas build --platform ios\` — no local Xcode/Android Studio needed
- Use EAS Submit to automate App Store and Play Store submissions
- Use EAS Update for OTA JavaScript updates — skip the app store review cycle
- Config plugins (app.config.ts) let you modify native projects without ejecting
- Use expo-constants, expo-device, expo-file-system for cross-platform native APIs

## Navigation (React Navigation / Expo Router)
- Use Expo Router: app/_layout.tsx defines the navigator, app/index.tsx is the home screen
- Stack navigator for hierarchical flows (push/pop), Tab navigator for main app sections
- Use typed routes: \`router.push("/users/[id]", { id: "123" })\`
- Deep linking works automatically with Expo Router — configure in app.config
- Use navigation state to persist and restore navigation across app restarts
- Modals: use presentation: "modal" in stack screen options
- Avoid deeply nested navigators — flatten where possible for performance

## Layout & Styling
- Always wrap content in SafeAreaView (expo-safe-area-context) to avoid notches/status bars
- Use StyleSheet.create() for styles — it validates and optimizes at creation time
- Flexbox is the default layout system — flexDirection defaults to "column" (not "row" like web)
- Use Dimensions or useWindowDimensions() for responsive layouts
- Platform-specific code: Platform.select({ ios: value, android: value }) or .ios.tsx / .android.tsx files
- Use react-native-reanimated for 60fps animations on the native thread
- Avoid inline styles in render — they create new objects on every render

## State Management
- Use Zustand for global state — lightweight, works great with React Native
- Use MMKV (react-native-mmkv) for persistent storage — 30x faster than AsyncStorage
- Use TanStack Query for server state — caching, refetching, offline support
- For offline-first: combine TanStack Query + MMKV persister + network-aware sync
- Keep navigation state separate from app state — React Navigation manages its own state

## Performance
- Use FlatList (not ScrollView) for lists — it virtualizes, rendering only visible items
- FlatList: set keyExtractor, getItemLayout (fixed height), maxToRenderPerBatch, windowSize
- Use React.memo for list items to prevent re-renders when data hasn't changed
- Use useCallback for event handlers passed to list items
- Avoid passing new objects/arrays as props in render — memoize or define outside
- Use Hermes engine (default in Expo) — it improves startup time and memory usage
- Profile with React DevTools and Flipper — never optimize without measuring first

## Native Modules & Platform Code
- Check expo packages first before reaching for community native modules
- Use expo-modules-api to write custom native modules in Swift/Kotlin
- Bridge native UI with requireNativeComponent or Expo's native view pattern
- Handle platform differences explicitly — don't assume iOS behavior works on Android
- Test on real devices — simulators miss performance issues, permissions, and hardware quirks

## Anti-Patterns
- Don't use ScrollView for long lists — use FlatList or FlashList
- Don't use web-specific APIs (window, document, localStorage) — they don't exist
- Don't ignore the keyboard — use KeyboardAvoidingView or react-native-keyboard-aware-scroll-view
- Don't hardcode dimensions — use relative sizing (flex) and useWindowDimensions
- Don't skip testing on Android — platform differences are real and frequent
- Don't use Animated API for complex animations — use react-native-reanimated instead
`,
  },
  {
    name: "swift-ios",
    description: "SwiftUI, async/await, Combine, SwiftData, MVVM, App Store guidelines",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["swift", "ios", "swiftui", "apple", "mobile", "xcode"],
    prompt: `# Swift iOS Development Expert

## SwiftUI Views
- Build UIs declaratively with structs conforming to View — return a body computed property
- Use VStack, HStack, ZStack for layout composition — avoid GeometryReader unless truly needed
- Prefer LazyVStack/LazyHStack inside ScrollView for long lists — they load items on demand
- Use List for built-in swipe actions, selection, and pull-to-refresh
- Modifiers order matters: \`.padding().background().cornerRadius()\` differs from reordering
- Extract subviews into separate structs to keep body readable (under ~30 lines)
- Use @ViewBuilder for functions that return opaque view types conditionally

## Property Wrappers
- @State for local view state — value types owned by the view
- @Binding for two-way connection to a parent's @State
- @StateObject for creating ObservableObject instances (create once, view owns it)
- @ObservedObject for ObservableObject passed in from parent (view doesn't own it)
- @EnvironmentObject for dependency injection of ObservableObject through the view hierarchy
- @Environment(\\.colorScheme) for reading system environment values
- @AppStorage for UserDefaults-backed persistent state
- In iOS 17+: use @Observable macro instead of ObservableObject for simpler observation

## MVVM Architecture
- View: SwiftUI views — declarative UI, no business logic
- ViewModel: @Observable class that holds state and business logic, exposes computed properties
- Model: plain structs/classes for data — Codable for serialization
- ViewModels should not import SwiftUI — keep them testable with plain Swift
- Use protocols for dependencies (networking, storage) to enable testability
- One ViewModel per screen/feature — avoid god ViewModels

## Async/Await & Concurrency
- Use async/await for network calls, file I/O, and any asynchronous work
- Use Task { } in SwiftUI to launch async work from synchronous contexts (onAppear, buttons)
- Use TaskGroup for concurrent parallel operations with structured cancellation
- Actor types protect mutable state from data races — use for shared resources
- @MainActor ensures code runs on the main thread — use for UI-updating classes
- Use AsyncSequence and for-await loops for streaming data (WebSockets, file reading)
- Handle cancellation: check Task.isCancelled or use withTaskCancellationHandler

## Data Persistence
- SwiftData (iOS 17+): use @Model macro on classes, @Query in views for reactive fetches
- SwiftData replaces Core Data for most use cases — simpler API, better SwiftUI integration
- Use ModelContainer for configuration, ModelContext for CRUD operations
- For key-value storage: UserDefaults (@AppStorage) for small data, Keychain for secrets
- For complex legacy needs: Core Data with NSPersistentContainer and @FetchRequest

## App Store Guidelines
- Follow Human Interface Guidelines — use standard navigation patterns and system controls
- Request permissions just-in-time with clear usage descriptions in Info.plist
- Implement in-app purchases with StoreKit 2 — server-side validation for subscriptions
- Support Dynamic Type for text accessibility — use system fonts and relative sizing
- Add VoiceOver labels to all interactive elements: \`.accessibilityLabel("Close button")\`
- Test on multiple device sizes and orientations — use preview providers

## Anti-Patterns
- Don't use force unwraps (!) in production code — use guard let, if let, or ?? defaults
- Don't put networking or heavy logic in View bodies — use ViewModels
- Don't use GeometryReader for simple layouts — it causes unnecessary complexity
- Don't ignore memory management — watch for retain cycles with [weak self] in closures
- Don't use Timer for background work — use Task with proper lifecycle management
- Don't hardcode strings — use String Catalogs or NSLocalizedString for localization
`,
  },
  {
    name: "flutter",
    description: "Dart patterns, widget tree, state management (Riverpod/Bloc), Material Design 3",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["flutter", "dart", "mobile", "widgets", "riverpod", "material"],
    prompt: `# Flutter & Dart Expert

## Dart Patterns
- Use null safety: \`String?\` for nullable, \`!\` only when you're certain (prefer null checks)
- Prefer final for variables that won't be reassigned: \`final name = "Flutter";\`
- Use named parameters with required keyword: \`void greet({required String name})\`
- Use extension methods to add functionality to existing types without subclassing
- Use sealed classes (Dart 3) for exhaustive pattern matching on state variants
- Cascade notation (..) for chaining operations on the same object
- Use records for lightweight data grouping: \`(String, int) getNameAndAge()\`
- Pattern matching with switch expressions: \`final label = switch(status) { Status.ok => "Good" };\`

## Widget Tree & Composition
- Everything is a widget — compose small, focused widgets into complex UIs
- StatelessWidget for UI that depends only on constructor parameters (immutable)
- StatefulWidget when the widget needs to manage mutable state with setState()
- Keep build() methods lean — extract sub-widget methods into separate widget classes
- Use const constructors wherever possible — they enable widget tree optimizations
- Prefer composition over inheritance — wrap widgets rather than extending them
- Use the Builder pattern for context-dependent widgets: \`Builder(builder: (context) => ...)\`

## State Management
- setState() for local widget state — fine for simple, isolated state
- Riverpod (recommended): Provider, StateNotifier, AsyncNotifier for scalable state
- Riverpod patterns: define providers at top level, use ref.watch() in widgets, ref.read() for actions
- Use AsyncValue (Riverpod) for loading/error/data states from async operations
- Bloc pattern: Events → Bloc → States — good for complex business logic with clear event flows
- Use ChangeNotifier + Provider for simpler apps, but Riverpod scales better
- Avoid global mutable state — use providers/blocs to scope state to features

## Navigation & Routing
- Use GoRouter for declarative, URL-based routing with deep link support
- Define routes in a central configuration: \`GoRouter(routes: [GoRoute(path: "/", builder: ...)])\`
- Use shell routes for persistent navigation (bottom tabs, drawers)
- Pass parameters via path or query params — avoid passing complex objects through navigation
- Use guards (redirect) for authentication-protected routes

## Platform Channels & Integration
- Use MethodChannel for calling native platform code (Swift/Kotlin) from Dart
- Use EventChannel for streaming data from native to Dart (sensors, Bluetooth)
- Use Pigeon for type-safe platform channel communication — generates boilerplate
- Check platform with \`Platform.isIOS\` / \`Platform.isAndroid\` for platform-specific behavior
- Use federated plugins to share platform-specific implementations across packages

## Material Design 3 & Theming
- Use Material 3: \`MaterialApp(theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.blue))\`
- Use ColorScheme for systematic color usage: primary, secondary, surface, error variants
- Use Theme.of(context) to access theme data — never hardcode colors or text styles
- Use TextTheme for consistent typography: \`Theme.of(context).textTheme.headlineMedium\`
- Support dark mode: provide both light and dark ThemeData to MaterialApp
- Use adaptive widgets (e.g., Switch.adaptive) for platform-appropriate appearance

## Performance
- Use const widgets to avoid unnecessary rebuilds — the framework skips const subtrees
- Use ListView.builder for long lists — it creates items lazily as they scroll into view
- Profile with Flutter DevTools: widget rebuild counts, frame rendering times, memory
- Use RepaintBoundary to isolate frequently updating parts of the widget tree
- Avoid building widgets in initState — use didChangeDependencies for context-dependent setup
- Use Isolates for CPU-heavy work — they run in separate threads without blocking UI

## Anti-Patterns
- Don't put all logic in widgets — separate business logic into repositories/services
- Don't use setState for state shared across widgets — use a state management solution
- Don't create deep widget nesting (10+ levels) — extract into named widget classes
- Don't ignore keys in lists — use ValueKey or ObjectKey for items that move/reorder
- Don't use BuildContext across async gaps — capture what you need before the await
- Don't hardcode sizes — use MediaQuery, LayoutBuilder, or Flex for responsive layouts
`,
  },
  {
    name: "rust-systems",
    description: "Ownership, borrowing, error handling, async Tokio, Actix/Axum, unsafe guidelines",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["rust", "systems", "tokio", "axum", "ownership", "concurrency"],
    prompt: `# Rust Systems Programming Expert

## Ownership & Borrowing
- Each value has exactly one owner — when the owner goes out of scope, the value is dropped
- Use references (&T) for read-only borrowing, (&mut T) for mutable borrowing
- Rule: unlimited &T OR exactly one &mut T — never both simultaneously
- Clone explicitly when you need a separate owned copy — don't fight the borrow checker blindly
- Use Cow<str> (Clone on Write) when you sometimes need to own, sometimes just borrow
- Prefer &str over String in function parameters — accepts both String and &str
- Use .as_ref(), .as_str(), .into() for ergonomic type conversions

## Error Handling
- Use Result<T, E> for recoverable errors — never panic in library code
- Use the ? operator to propagate errors up the call chain concisely
- Define custom error enums with thiserror: \`#[error("not found: {id}")] NotFound { id: u64 }\`
- Use anyhow::Result for application code where you don't need typed errors
- Reserve panic!() and .unwrap() for truly unrecoverable situations or tests
- Use .expect("reason") over .unwrap() — document WHY you believe it won't fail
- Map errors at boundaries: \`.map_err(|e| MyError::Database(e))?\`

## Lifetimes
- Lifetimes prevent dangling references — the compiler ensures references outlive their use
- Elision rules handle most cases — only annotate when the compiler asks you to
- Named lifetimes: \`fn first<'a>(items: &'a [T]) -> &'a T\` — output lives as long as input
- 'static means the reference lives for the entire program — owned data or compile-time constants
- Lifetime bounds on structs: \`struct Parser<'a> { input: &'a str }\` — struct can't outlive the reference
- When fighting lifetimes: consider if you should own the data instead of borrowing

## Async with Tokio
- Use #[tokio::main] for the async runtime entry point
- Use tokio::spawn for concurrent tasks — returns a JoinHandle for awaiting results
- Use tokio::select! to race multiple futures — first one to complete wins
- Use tokio::sync::Mutex for async-safe locking (not std::sync::Mutex in async code)
- Use channels (mpsc, broadcast, oneshot) for communication between tasks
- Use tokio::time::timeout to prevent indefinite waits on futures
- Use Stream (futures/tokio-stream) for async iterators — process items as they arrive

## Web with Axum
- Define handlers as async functions: \`async fn get_user(Path(id): Path<u64>) -> impl IntoResponse\`
- Use extractors for parsing: Path, Query, Json, State, Headers — composable and type-safe
- Shared state with State(Arc<AppState>) — wrap in Arc for thread-safe sharing
- Use tower middleware for logging, CORS, auth, rate limiting — composable layers
- Error handling: implement IntoResponse for your error type to control HTTP responses
- Use Router::new().route("/users", get(list).post(create)) for clean route definitions
- Use axum::serve with graceful_shutdown for production deployments

## Cargo & Project Structure
- Use Cargo workspaces for multi-crate projects: shared deps, unified builds
- Feature flags for conditional compilation: \`#[cfg(feature = "postgres")]\`
- Use clippy: \`cargo clippy -- -W clippy::all\` — it catches common mistakes and idioms
- Organize: lib.rs for library logic, main.rs for binary entry, mod.rs for module roots
- Use integration tests in tests/ directory — they test your public API as an external consumer
- Profile with cargo bench (criterion) and cargo flamegraph for performance optimization

## Unsafe Guidelines
- Avoid unsafe unless absolutely necessary — most Rust code should be 100% safe
- Valid reasons for unsafe: FFI, raw pointer manipulation, implementing unsafe traits
- Document every unsafe block with a SAFETY comment explaining why it's sound
- Minimize the scope of unsafe blocks — keep the unsafe surface area as small as possible
- Use safe abstractions around unsafe internals — expose a safe API to callers
- Prefer well-audited crates (libc, nix, windows-rs) over raw FFI bindings

## Anti-Patterns
- Don't clone everything to avoid the borrow checker — understand ownership first
- Don't use Rc/RefCell as a default — they add runtime overhead, use references instead
- Don't ignore compiler warnings — Rust warnings almost always indicate real issues
- Don't use String when &str suffices — unnecessary allocation
- Don't block the async runtime with synchronous I/O — use tokio::task::spawn_blocking
- Don't write unsafe for convenience — only for correctness when safe Rust can't express it
`,
  },
  {
    name: "go-backend",
    description: "Go standard library, error handling, goroutines, interfaces, table-driven tests",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["go", "golang", "backend", "concurrency", "testing"],
    prompt: `# Go Backend Expert

## Standard Library First
- Use net/http for HTTP servers — it's production-ready and widely understood
- Use http.ServeMux (Go 1.22+) with method-aware routing: \`mux.HandleFunc("GET /users/{id}", handler)\`
- Use encoding/json for JSON: \`json.NewDecoder(r.Body).Decode(&v)\` for requests, json.NewEncoder for responses
- Use database/sql with a driver (pgx, go-sql-driver) — it handles connection pooling
- Use log/slog (Go 1.21+) for structured logging: \`slog.Info("user created", "id", user.ID)\`
- Use html/template for server-rendered HTML — auto-escapes to prevent XSS
- Use embed for bundling static assets and templates into the binary
- Reach for third-party libraries only when the stdlib genuinely falls short

## Error Handling
- Errors are values — return them, don't panic: \`func Open(name string) (*File, error)\`
- Always check errors: \`if err != nil { return fmt.Errorf("opening config: %w", err) }\`
- Wrap errors with %w for context: \`fmt.Errorf("creating user %s: %w", name, err)\`
- Use errors.Is() to check for specific errors: \`if errors.Is(err, sql.ErrNoRows)\`
- Use errors.As() to extract typed errors: \`var pathErr *os.PathError; errors.As(err, &pathErr)\`
- Define sentinel errors: \`var ErrNotFound = errors.New("not found")\`
- Don't use panic for expected failures — reserve panic for truly unrecoverable programmer errors

## Goroutines & Channels
- Use goroutines for concurrent work — they're lightweight (2KB stack) and managed by the runtime
- Always ensure goroutines can terminate — use context.Context for cancellation
- Use sync.WaitGroup to wait for a group of goroutines to finish
- Use channels for communication between goroutines: \`ch := make(chan Result, bufSize)\`
- Buffered channels for producer/consumer, unbuffered for synchronization
- Use select for multiplexing: waiting on multiple channels or timeouts
- Use errgroup (golang.org/x/sync) for groups of goroutines that return errors
- Avoid goroutine leaks: always close channels, cancel contexts, and handle done signals

## Interfaces
- Interfaces are small: \`type Reader interface { Read(p []byte) (n int, err error) }\`
- Accept interfaces, return structs — keep interfaces at the consumer, not the producer
- Don't create interfaces until you need them — premature abstraction is costly in Go
- Implicit implementation: types satisfy interfaces without explicit declaration
- Use io.Reader, io.Writer, fmt.Stringer — standard interfaces enable composition
- Empty interface (any) should be rare — use generics (Go 1.18+) for type-safe polymorphism

## Project Structure
- Keep it simple: cmd/ for entry points, internal/ for private packages, pkg/ only if truly reusable
- Use internal/ to prevent external packages from importing your implementation details
- One package per directory — package name matches the directory name
- Avoid circular dependencies — they're compile errors in Go
- Use Go modules: go.mod at the root, run go mod tidy to clean up dependencies
- Follow standard naming: lowercase packages, MixedCaps for exported, camelCase for unexported

## Table-Driven Tests
- Use table-driven tests for exhaustive input/output coverage:
- Pattern: define []struct{ name, input, want }, loop with t.Run(tc.name, func(t *testing.T) { ... })
- Use t.Parallel() for independent tests — speeds up test suites
- Use testify/assert for readable assertions, or stick with stdlib for zero dependencies
- Use t.Helper() in test helper functions to fix file/line reporting
- Use t.Cleanup() for teardown — it runs after the test and all its subtests
- Use testcontainers-go for integration tests with real databases and services

## Anti-Patterns
- Don't ignore errors with \`_ = someFunc()\` — handle or explicitly document why it's safe
- Don't use init() functions — they make testing hard and hide initialization order
- Don't use global mutable state — pass dependencies explicitly via struct fields or function params
- Don't overuse channels — a mutex is simpler when you just need to protect shared data
- Don't create interfaces for single implementations — that's Java, not Go
- Don't return interfaces — return concrete types and let consumers define their own interfaces
`,
  },
  {
    name: "node-backend",
    description: "Express/Fastify, middleware, input validation, JWT auth, error handling, graceful shutdown",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["node", "express", "fastify", "backend", "api", "middleware"],
    prompt: `# Node.js Backend Expert

## Framework Choice
- Express for simplicity and ecosystem maturity — huge middleware library, well-documented
- Fastify for performance — 2-3x faster than Express, built-in schema validation, TypeScript-first
- Use Fastify's plugin system for encapsulated, reusable modules
- Both support async handlers — always use async/await, never callbacks
- For new projects: Fastify is recommended for its speed, schema validation, and TypeScript support

## Middleware Patterns
- Middleware executes in order — put auth before route handlers, error handlers last
- Express: \`app.use(middleware)\` for global, \`router.use(middleware)\` for scoped
- Fastify: use hooks (onRequest, preHandler, onSend) or plugins for middleware-like behavior
- Common middleware stack: cors → helmet → rate-limiter → body-parser → auth → routes → error-handler
- Keep middleware focused: one concern per middleware (logging, auth, validation)
- Use express-async-errors or wrap handlers to catch async errors automatically

## Input Validation
- Validate ALL incoming data at the boundary — never trust req.body, req.params, req.query
- Use Zod for runtime validation + TypeScript type inference: \`const UserSchema = z.object({...})\`
- Validate in middleware: parse input before it reaches the handler, reject invalid requests early
- Pattern: \`const data = UserSchema.parse(req.body)\` — throws ZodError on invalid input
- Fastify: use JSON Schema in route definitions for automatic validation + serialization
- Validate path params and query strings too — not just the body
- Return structured validation errors: \`{ errors: [{ field: "email", message: "Invalid email" }] }\`

## Authentication
- Use bcrypt (cost factor 12+) for password hashing — never store plaintext passwords
- JWTs for stateless auth: short-lived access tokens (15min), longer refresh tokens (7 days)
- Store refresh tokens in httpOnly cookies — never in localStorage (XSS vulnerability)
- Verify JWTs with jose or jsonwebtoken: check signature, expiry, issuer, audience
- Middleware pattern: decode JWT → find user → attach to req.user → call next()
- Use passport.js only if you need multiple OAuth providers — otherwise it's overhead
- Implement token rotation: issue new refresh token on each use, revoke old one

## Error Handling
- Use a centralized error handler middleware — the last app.use() with (err, req, res, next)
- Define custom error classes: AppError extends Error with statusCode and isOperational
- Distinguish operational errors (bad input, not found) from programmer errors (null reference)
- Never send stack traces to clients in production — log them, return a generic message
- Use process.on('unhandledRejection') and process.on('uncaughtException') as safety nets
- Return consistent error format: \`{ error: { code: "NOT_FOUND", message: "User not found" } }\`

## Rate Limiting & Security
- Use express-rate-limit or @fastify/rate-limit — essential for public APIs
- Apply stricter limits to auth endpoints (login, register, password reset)
- Use helmet for security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- Use cors with explicit origin allowlist — never use \`origin: "*"\` in production
- Implement request ID (uuid) for tracing requests across services and logs

## Structured Logging & Graceful Shutdown
- Use pino (Fastify default) or winston — never console.log in production
- Log as JSON with consistent fields: timestamp, level, requestId, message, metadata
- Log at boundaries: incoming request, outgoing response, external API calls, errors
- Graceful shutdown: handle SIGTERM/SIGINT → stop accepting requests → finish in-flight → close DB/Redis → exit
- Pattern: \`process.on("SIGTERM", async () => { await server.close(); await db.end(); process.exit(0); })\`
- Set a shutdown timeout (10-30s) — force exit if graceful shutdown hangs

## Anti-Patterns
- Don't use callback-based APIs — use promisify() or native promise alternatives
- Don't block the event loop with synchronous operations (fs.readFileSync, crypto.pbkdf2Sync)
- Don't catch errors silently: \`catch (e) {}\` — always log or handle meaningfully
- Don't use \`res.send()\` after \`next()\` — it causes "headers already sent" errors
- Don't store sessions in memory — use Redis or a database for production session storage
- Don't skip input validation because "the frontend validates" — the frontend is untrusted
`,
  },
  {
    name: "sql-master",
    description: "Query optimization, indexing, schema design, migrations, CTEs, window functions",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["sql", "postgres", "mysql", "database", "indexing", "performance"],
    prompt: `# SQL Mastery Expert

## Schema Design
- Use appropriate data types: INTEGER for IDs, TEXT/VARCHAR for strings, TIMESTAMPTZ for dates
- Always use TIMESTAMPTZ (not TIMESTAMP) for dates — store in UTC, convert in the app
- Add NOT NULL constraints by default — make columns nullable only when NULL has business meaning
- Use UUID (gen_random_uuid) for public-facing IDs, BIGSERIAL for internal primary keys
- Define foreign keys with appropriate ON DELETE behavior: CASCADE, SET NULL, or RESTRICT
- Add created_at and updated_at columns to every table — use triggers for updated_at
- Use CHECK constraints for data validation: \`CHECK (price >= 0)\`, \`CHECK (status IN ('active','inactive'))\`
- Normalize to 3NF by default — denormalize intentionally for read-heavy queries with measured need

## Indexing Strategies
- Index columns used in WHERE, JOIN, ORDER BY, and GROUP BY clauses
- B-tree indexes (default) work for equality and range queries: =, <, >, BETWEEN, LIKE 'prefix%'
- Composite indexes: put equality columns first, range columns last: \`(status, created_at)\`
- Covering indexes include all columns a query needs — avoids heap lookups (INDEX ... INCLUDE)
- Partial indexes for filtered queries: \`CREATE INDEX ON orders (user_id) WHERE status = 'pending'\`
- GIN indexes for JSONB, full-text search, and array columns
- Don't over-index — each index slows writes and consumes storage. Index what you query.
- Use CONCURRENTLY for production index creation: \`CREATE INDEX CONCURRENTLY ...\`

## Query Optimization
- Use EXPLAIN ANALYZE to see actual execution plans — not just EXPLAIN (which estimates)
- Look for: Seq Scan (missing index?), Nested Loop (N+1?), Sort (missing index?), high row estimates vs actuals
- Avoid SELECT * — select only the columns you need
- Use JOINs instead of subqueries where possible — the optimizer handles JOINs better
- Avoid functions on indexed columns in WHERE: \`WHERE created_at > '2024-01-01'\` not \`WHERE YEAR(created_at) = 2024\`
- Use EXISTS instead of IN for correlated subqueries — it short-circuits on first match
- LIMIT early in subqueries to reduce the working set for outer queries
- Use connection pooling (PgBouncer, built-in pool) — don't open a connection per request

## Common Table Expressions (CTEs)
- Use CTEs for readability: \`WITH active_users AS (SELECT ...) SELECT ... FROM active_users\`
- CTEs are optimization fences in some databases — the optimizer may not push predicates into them
- Recursive CTEs for hierarchical data: org charts, category trees, threaded comments
- Pattern: \`WITH RECURSIVE tree AS (base UNION ALL SELECT ... FROM tree JOIN ... ) SELECT * FROM tree\`
- Use CTEs to break complex queries into named, readable steps — each CTE is a logical unit

## Window Functions
- ROW_NUMBER() for pagination, deduplication, and picking the latest record per group
- RANK() and DENSE_RANK() for ranking with ties (RANK skips, DENSE_RANK doesn't)
- LAG/LEAD for comparing rows to previous/next rows: \`LAG(amount) OVER (ORDER BY date)\`
- SUM/AVG/COUNT as window functions for running totals: \`SUM(amount) OVER (ORDER BY date)\`
- Use PARTITION BY to compute within groups: \`ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC)\`
- FILTER clause for conditional aggregation: \`COUNT(*) FILTER (WHERE status = 'active')\`

## Migrations
- Use a migration tool: Flyway, Liquibase, golang-migrate, Prisma Migrate, or Knex
- Every schema change is a numbered, version-controlled migration — never modify production DDL manually
- Make migrations backward-compatible: add columns with defaults, avoid renaming in one step
- Large table changes: add column → backfill → add constraint, not ALTER + NOT NULL in one migration
- Always test migrations on a copy of production data before applying to production
- Include both up and down migrations — even if you rarely use rollbacks

## Avoiding N+1 Queries
- N+1: fetching a list then querying related data per item — O(N) queries instead of O(1)
- Fix with JOINs: \`SELECT users.*, orders.* FROM users JOIN orders ON ...\`
- Fix with IN: \`SELECT * FROM orders WHERE user_id IN (1,2,3,...)\` — batch the lookups
- ORMs: use eager loading (include, joinedload, preload) to fetch relations in one query
- Monitor query counts in development — log the number of queries per request

## Anti-Patterns
- Don't use SELECT * in production queries — specify columns explicitly
- Don't store CSV or JSON when you need relational data — normalize it
- Don't skip foreign keys for "flexibility" — they enforce data integrity
- Don't use OFFSET for deep pagination — use cursor-based (WHERE id > last_id) instead
- Don't run schema changes without a migration tool — you'll lose track of database state
- Don't optimize queries without EXPLAIN ANALYZE — measure before changing
`,
  },
  {
    name: "supabase",
    description: "Auth, Row Level Security, edge functions, real-time, Postgres functions, storage",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["supabase", "postgres", "auth", "realtime", "edge-functions", "baas"],
    prompt: `# Supabase Expert

## Auth Setup
- Use Supabase Auth for email/password, magic link, OAuth (Google, GitHub, etc.)
- Client: \`const { data, error } = await supabase.auth.signUp({ email, password })\`
- Always check for errors after auth operations — don't assume success
- Use onAuthStateChange listener to react to sign-in/sign-out events globally
- Store user metadata in a separate profiles table linked by auth.uid() — don't overload auth.users
- Use auth.getUser() (server-side verified) over auth.getSession() (client JWT only) for security
- Configure email templates and redirect URLs in the Supabase dashboard
- Set up proper redirect handling for OAuth: signInWithOAuth({ options: { redirectTo } })

## Row Level Security (RLS)
- ALWAYS enable RLS on every table: \`ALTER TABLE posts ENABLE ROW LEVEL SECURITY\`
- Without RLS policies, NO rows are accessible — it's deny-by-default
- Use auth.uid() in policies to scope access to the authenticated user
- SELECT policy: \`CREATE POLICY "users read own" ON posts FOR SELECT USING (user_id = auth.uid())\`
- INSERT policy: \`CREATE POLICY "users insert own" ON posts FOR INSERT WITH CHECK (user_id = auth.uid())\`
- Use auth.jwt() -> 'user_role' for role-based access in policies
- Test RLS policies thoroughly — use Supabase SQL editor with \`SET request.jwt.claims = ...\`
- For public data, create a policy with \`USING (true)\` — but be intentional about it

## Database & Postgres Functions
- Use the Supabase client for CRUD: \`supabase.from("posts").select("*, author:profiles(name)")\`
- Foreign key relations are automatic in .select() — use the relation name for joins
- Use Postgres functions for complex operations: \`supabase.rpc("function_name", { param: value })\`
- Write functions in SQL or PL/pgSQL: \`CREATE FUNCTION get_stats(...) RETURNS TABLE (...) AS $$ ... $$\`
- Use SECURITY DEFINER functions to bypass RLS when needed (admin operations) — with caution
- Set search_path in SECURITY DEFINER functions to prevent search path injection
- Use database triggers for automated side effects: updated_at timestamps, audit logs, notifications

## Edge Functions
- Write edge functions in Deno/TypeScript — they run on Supabase's edge infrastructure
- Use for: webhooks, third-party API calls, custom auth flows, scheduled jobs
- Create a Supabase client inside edge functions with the service_role key for admin access
- Validate incoming requests: check auth headers, parse and validate request bodies
- Use Deno's built-in fetch for external API calls — edge functions have internet access
- Deploy with \`supabase functions deploy function-name\`
- Set secrets with \`supabase secrets set API_KEY=value\` — access via Deno.env.get()

## Real-Time Subscriptions
- Subscribe to database changes: \`supabase.channel("posts").on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, callback).subscribe()\`
- Filter subscriptions: \`filter: "user_id=eq.abc123"\` — don't subscribe to all rows
- Use Broadcast for ephemeral messages (typing indicators, cursor positions)
- Use Presence for tracking online users and their state
- Unsubscribe when components unmount: \`supabase.removeChannel(channel)\`
- RLS policies apply to real-time — users only receive changes they're authorized to see

## Storage
- Use Supabase Storage for file uploads: images, documents, videos
- Create buckets with appropriate policies: public (avatars) vs private (documents)
- Upload: \`supabase.storage.from("avatars").upload(path, file, { contentType })\`
- Use signed URLs for time-limited access to private files: \`createSignedUrl(path, expiresIn)\`
- Use image transformations for thumbnails: \`getPublicUrl(path, { transform: { width: 200 } })\`
- Set file size limits and allowed MIME types per bucket in storage policies

## Typed Client Generation
- Generate TypeScript types from your database: \`supabase gen types typescript --project-id xxx > types/supabase.ts\`
- Use generated types with the client: \`createClient<Database>(url, key)\`
- Types provide autocomplete for table names, column names, and filter operations
- Regenerate types after every migration — keep types in sync with the schema
- Use Database['public']['Tables']['posts']['Row'] for row types in your app code

## Anti-Patterns
- Don't skip RLS — an unprotected table is a data breach waiting to happen
- Don't use the service_role key on the client side — it bypasses all RLS
- Don't query without filters on large tables — always scope your queries
- Don't use real-time for everything — polling is simpler for low-frequency updates
- Don't store business logic only in the client — use Postgres functions or edge functions
- Don't hardcode Supabase URLs and keys — use environment variables
`,
  },
  {
    name: "unity-csharp",
    description: "MonoBehaviour lifecycle, ScriptableObjects, ECS, object pooling, performance profiling",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["unity", "csharp", "gamedev", "ecs", "performance", "game-engine"],
    prompt: `# Unity & C# Game Development Expert

## MonoBehaviour Lifecycle
- Awake() → OnEnable() → Start() → FixedUpdate() → Update() → LateUpdate() → OnDisable() → OnDestroy()
- Use Awake() for self-initialization (cache component references with GetComponent<T>())
- Use Start() for initialization that depends on other objects being ready
- Use FixedUpdate() for physics — it runs at a fixed timestep (default 50Hz), independent of framerate
- Use Update() for input handling and non-physics game logic — runs once per frame
- Use LateUpdate() for camera follow and anything that must happen after all Update() calls
- Cache component references in Awake: \`private Rigidbody _rb; void Awake() => _rb = GetComponent<Rigidbody>();\`
- Never use GetComponent in Update — it's an expensive lookup every frame

## ScriptableObjects
- Use ScriptableObjects for shared, data-driven assets: enemy stats, item definitions, game config
- Create with: \`[CreateAssetMenu(fileName = "NewWeapon", menuName = "Game/Weapon")] public class WeaponData : ScriptableObject\`
- ScriptableObjects persist in the project (not the scene) — changes in editor persist, changes at runtime don't (in builds)
- Use them to decouple data from behavior — MonoBehaviours reference ScriptableObjects, not each other
- Event channels: use ScriptableObject-based events to decouple systems without direct references
- Pattern: ScriptableObject holds a list of listeners, Raise() notifies all — no singleton needed

## Object Pooling
- Instantiate/Destroy is expensive — pool frequently created/destroyed objects (bullets, particles, enemies)
- Unity's built-in ObjectPool<T> (UnityEngine.Pool): \`new ObjectPool<GameObject>(createFunc, onGet, onRelease, onDestroy)\`
- On Get: activate the object, reset its state (position, velocity, health)
- On Release: deactivate the object, return it to the pool — don't Destroy it
- Pre-warm pools at scene load to avoid frame hitches during gameplay
- Use pool for particle systems, audio sources, and UI elements — not just game objects

## Entity Component System (ECS)
- Unity DOTS: Entities for data, Systems for logic, Components for pure data (no methods)
- IComponentData structs are blittable data — no references, no managed types
- SystemBase or ISystem process entities with matching component queries
- Use Burst compiler for performance-critical systems — compiles to optimized native code
- Jobs system for multi-threaded work: IJobEntity, IJobChunk for parallel processing
- Use ECS for massive entity counts (10K+ units) — traditional MonoBehaviours for simpler needs

## Physics Best Practices
- Move Rigidbodies with forces (AddForce) or velocity — never transform.position for physics objects
- Use layers and the collision matrix to control which objects interact
- Use Physics.OverlapSphereNonAlloc() to avoid allocations in physics queries
- Prefer discrete collision detection; use continuous only for fast-moving small objects
- Use FixedUpdate for all physics code — Update runs at variable rate and causes jittery physics
- Avoid moving static colliders at runtime — it rebuilds the physics tree (expensive)

## Coroutines vs Async/Await
- Coroutines (yield return): tied to MonoBehaviour, stop when GameObject is disabled/destroyed
- Use yield return new WaitForSeconds(t) for delays, WaitUntil(() => condition) for polling
- Async/await (UniTask recommended): proper cancellation, no MonoBehaviour dependency, awaitable
- Use CancellationToken with async/await and link to destroyCancellationToken for auto-cleanup
- Prefer async/await for complex async flows; coroutines for simple sequences and visual scripting

## Asset Management
- Use Addressables for loading assets on demand — reduces build size and startup time
- Never use Resources.Load in production — it forces all Resources/ assets into the build
- Unload unused assets: Addressables.Release() for counted references, Resources.UnloadUnusedAssets() as fallback
- Use asset bundles / Addressable groups to organize content for DLC or streaming
- Sprite atlases for UI and 2D — reduce draw calls by batching sprites into a single texture

## Performance Profiling
- Use Unity Profiler (Window > Analysis > Profiler) — identify CPU, GPU, memory, and rendering bottlenecks
- Profile on target hardware — editor performance is not representative of builds
- Watch for GC allocations in hot paths: use struct over class, avoid LINQ in Update, pre-allocate collections
- Reduce draw calls: batching, atlasing, LODs, occlusion culling
- Use Frame Debugger to inspect individual draw calls and shader passes
- Profile with Deep Profile only when needed — it adds significant overhead

## Anti-Patterns
- Don't use Find("name") or FindObjectOfType at runtime — cache references or use events
- Don't allocate in Update: no new List<T>, no LINQ, no string concatenation in hot loops
- Don't use SendMessage — it's slow and stringly typed, use direct references or events
- Don't put everything on one GameObject — split responsibilities across child objects
- Don't ignore the profiler — gut feelings about performance are usually wrong
- Don't use singletons for everything — use dependency injection or ScriptableObject events
`,
  },
  {
    name: "git-workflow",
    description: "Conventional commits, branching strategies, PR best practices, rebase, hooks",
    version: "1.0.0",
    author: "codemaxxing",
    tags: ["git", "workflow", "commits", "branching", "code-review", "hooks"],
    prompt: `# Git Workflow Expert

## Conventional Commits
- Format: \`type(scope): description\` — e.g., \`feat(auth): add OAuth2 login flow\`
- Types: feat (new feature), fix (bug fix), docs, style, refactor, perf, test, build, ci, chore
- Breaking changes: add ! after type or BREAKING CHANGE in footer: \`feat(api)!: rename /users to /accounts\`
- Scope is optional but helpful: module, component, or feature area
- Description: imperative mood, lowercase, no period — "add login page" not "Added login page."
- Body: wrap at 72 chars, explain WHAT and WHY (not HOW — the diff shows how)
- Use commitlint + husky to enforce conventional commits in CI and locally

## Branching Strategies
- Trunk-based: short-lived feature branches (1-2 days), merge to main frequently, feature flags for WIP
- GitFlow: main + develop + feature/ + release/ + hotfix/ — suited for versioned releases, more overhead
- GitHub Flow: branch from main → PR → review → merge to main — simple, good for continuous deployment
- For most teams: trunk-based or GitHub Flow — GitFlow adds complexity that slows teams down
- Branch naming: type/description — \`feat/user-auth\`, \`fix/login-redirect\`, \`chore/update-deps\`
- Delete branches after merge — don't accumulate stale branches

## Pull Request Best Practices
- Keep PRs small (under 400 lines changed) — large PRs get rubber-stamped, not reviewed
- Write descriptive PR titles and descriptions: what changed, why, how to test
- One concern per PR — don't mix a feature with a refactor with a bug fix
- Add screenshots/recordings for UI changes
- Self-review your PR before requesting review — catch obvious issues yourself
- Request reviewers who own the affected code area
- Respond to review comments promptly — don't let PRs go stale

## Interactive Rebase
- Use \`git rebase -i HEAD~N\` to clean up commits before opening a PR
- Squash WIP commits into logical units: one commit per meaningful change
- Reword commit messages to follow conventions: pick → reword
- Fixup: absorb small fixes into the commit they belong to: pick → fixup
- Never rebase commits that are already on shared branches (main, develop)
- Prefer rebase over merge for feature branches — cleaner linear history
- After rebase, force-push to your branch only: \`git push --force-with-lease\` (safer than --force)

## Cherry-Pick & Bisect
- Cherry-pick to apply specific commits to another branch: \`git cherry-pick <sha>\`
- Use cherry-pick for hotfixes: fix on main, cherry-pick to release branch
- Use -x flag to record the source commit: \`git cherry-pick -x <sha>\`
- Bisect to find the commit that introduced a bug: \`git bisect start\`, \`git bisect bad\`, \`git bisect good <sha>\`
- Automate bisect with a test script: \`git bisect run npm test\`
- Bisect is O(log n) — it finds the bad commit in ~10 steps for 1000 commits

## Git Hooks
- Use husky (npm) or pre-commit (Python) to manage hooks across the team
- pre-commit: lint staged files (lint-staged), format code, check for secrets
- commit-msg: validate commit message format (commitlint)
- pre-push: run tests, type-check — catch issues before they hit CI
- Don't put slow operations in pre-commit — keep it under 5 seconds
- Use lint-staged to only process staged files: \`"*.ts": ["eslint --fix", "prettier --write"]\`

## .gitattributes & Configuration
- Use .gitattributes for consistent line endings: \`* text=auto\` normalizes to LF
- Mark binary files: \`*.png binary\`, \`*.zip binary\` — prevents diff/merge issues
- Use .gitattributes for diff drivers: \`*.lockfile binary\` to skip noisy lockfile diffs
- Use .gitignore for build artifacts, dependencies, env files, editor config
- Global gitignore (~/.gitignore_global) for personal editor files (.vscode, .idea, .DS_Store)
- Configure merge strategies per file: \`package-lock.json merge=ours\` to auto-resolve lockfile conflicts

## Advanced Techniques
- Use git stash for quick context switches: \`git stash push -m "WIP: feature X"\`
- Use git worktree for working on multiple branches simultaneously without stashing
- Use git reflog to recover lost commits — it tracks every HEAD movement for 90 days
- Use git blame -w to ignore whitespace changes when tracking down who wrote a line
- Use git log --all --graph --oneline for a visual branch/merge history
- Use git diff --stat for a quick summary of changes before committing

## Anti-Patterns
- Don't commit directly to main — use branches and PRs for all changes
- Don't use \`git add .\` blindly — review staged files to avoid committing secrets or artifacts
- Don't rewrite shared history — rebase and amend only your own unpushed commits
- Don't write commit messages like "fix" or "WIP" or "asdf" — future you will be confused
- Don't keep long-lived branches — merge or rebase frequently to avoid painful conflicts
- Don't skip code review — even small changes benefit from a second pair of eyes
`,
  },
];
