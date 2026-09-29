<<<<<<< HEAD
# PatientScure — Project & WordPress Backend API Introduction

## 1. Project Overview

**PatientScure** is a health and wellness information platform focused primarily on **Ayurvedic remedies, diseases, ingredients, and educational health content**.

The project is being built with a modern headless architecture:

**Frontend**

* Next.js
* React
* TypeScript
* Tailwind CSS
* Server-side rendering / static generation where appropriate
* SEO-focused architecture
* Google AdSense monetization

**Backend / CMS**

* WordPress
* WordPress REST API
* Advanced Custom Fields (ACF Pro)
* Custom Post Types
* Custom WordPress setup/plugin code
* Yoast SEO

The WordPress installation acts primarily as the **content management system and structured content API**, while the Next.js application acts as the public-facing website.

---

# 2. High-Level Architecture

The current architecture is:

```text
                    ┌──────────────────────┐
                    │      WordPress       │
                    │      Backend/CMS     │
                    │                      │
                    │  Posts               │
                    │  Diseases            │
                    │  Remedies             │
                    │  Ingredients          │
                    │  ACF Fields           │
                    │  Yoast SEO            │
                    └──────────┬───────────┘
                               │
                         WordPress REST API
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Next.js App      │
                    │      Frontend        │
                    │                      │
                    │ SSR / SSG             │
                    │ React Components      │
                    │ Tailwind CSS          │
                    │ SEO Metadata          │
                    │ Structured Content    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   PatientScure.com   │
                    │    Public Website    │
                    └──────────────────────┘
```

The important architectural principle is:

> **WordPress is the structured content backend. Next.js is the presentation layer.**

Do not turn the frontend into a traditional WordPress theme.

---

# 3. WordPress Backend

The WordPress installation contains structured content rather than simply being used as a traditional blogging CMS.

The primary content types are:

### Diseases

REST endpoint:

```text
/wp-json/wp/v2/disease
```

Used for disease/condition information.

A disease can contain structured information through ACF fields and relationships to remedies and other content.

---

### Remedies

REST endpoint:

```text
/wp-json/wp/v2/remedy
```

The project previously had an important REST configuration issue where the CPT `rest_base` was incorrectly configured as:

```text
remedys
```

instead of:

```text
remedies
```

This was corrected.

The frontend therefore expects the remedies API to be available through the correct REST route.

---

### Ingredients

REST endpoint:

```text
/wp-json/wp/v2/ingredient
```

Ingredients represent Ayurvedic/herbal/food ingredients used throughout the PatientScure content system.

Ingredient pages can contain structured information such as:

* Common name
* Botanical information
* Description
* Ayurvedic properties
* Traditional uses
* Benefits
* Precautions
* Related remedies
* Other structured ACF information

---

### Articles / Posts

The project also contains article content.

The frontend consumes WordPress article/post data through the REST API.

Some legacy WordPress posts have been migrated into the newer Article content structure.

Because URLs changed from the older structure to the newer:

```text
/article/{slug}
```

redirect handling has been implemented in the WordPress backend so old URLs do not unnecessarily become 404 pages.

---

# 4. ACF Pro

**Advanced Custom Fields Pro is a core part of the PatientScure backend architecture.**

WordPress provides the basic post/CPT framework while ACF provides structured fields.

The goal is to expose the relevant ACF data through the WordPress REST API so the Next.js frontend can consume the complete structured content.

The project has previously encountered issues where:

* ACF fields were not appearing in REST responses
* `show_in_rest` configuration needed attention
* Repeater fields were not appearing as expected
* CPT REST configuration caused endpoint problems

These should be considered when modifying the backend.

Do not assume that an ACF field is automatically available to the frontend simply because it exists in WordPress.

Whenever adding or changing ACF fields, verify that the data is actually exposed through:

```text
/wp-json/wp/v2/...
```

before modifying the frontend.

---

# 5. WordPress Setup Plugin

PatientScure uses custom WordPress setup code/plugin functionality to handle project-specific backend behavior.

There is a custom setup implementation commonly referred to as:

```text
patientscure-setup.php
```

This is used for project-specific WordPress functionality such as:

* CPT configuration
* REST API customization
* redirects
* backend hooks
* API modifications
* project-specific WordPress behavior

Before creating another plugin or adding duplicate functionality, inspect the existing PatientScure setup code.

Prefer extending existing project architecture over creating multiple overlapping plugins.

---

# 6. Yoast SEO

Yoast SEO is installed on the WordPress backend.

The project wants SEO information to remain available to the Next.js frontend wherever practical.

The WordPress REST API has been configured/verified so Yoast-related data can be exposed.

The long-term objective is to allow content editors to manage important SEO information from WordPress while the Next.js frontend renders the corresponding metadata.

SEO considerations include:

* SEO title
* Meta description
* Canonical URL
* Open Graph information
* Social metadata
* Article metadata
* Structured content
* Sitemap
* Robots directives where appropriate

Do not blindly duplicate Yoast functionality in Next.js if the same information already exists in WordPress.

---

# 7. Next.js Frontend

The frontend was originally developed as a Vite/React application and was later migrated to **Next.js App Router**.

The migration preserved the existing UI/UX while introducing server-side rendering and better SEO architecture.

The application uses:

```text
Next.js App Router
TypeScript
React
Tailwind CSS
```

Dynamic routes include concepts such as:

```text
/articles/[slug]
/diseases/[slug]
/remedies/[slug]
/ingredients/[slug]
```

The exact route structure should be inspected in the current repository before making assumptions.

---

# 8. ContentService

The frontend uses a centralized content/API layer, commonly referred to as:

```text
ContentService
```

This service is responsible for communicating with the WordPress REST API.

A key architectural decision was made for API URLs:

### Browser

The browser can use the Next.js proxy:

```text
/wp-json/wp/v2/...
```

### Server

Server-side rendering can use the WordPress API URL configured through environment variables.

The project previously used logic similar to:

```text
NEXT_PUBLIC_WORDPRESS_API_URL
```

for server-side API access.

The exact current implementation should always be checked in the repository before modifying it.

Do not hard-code API URLs throughout individual components.

---

# 9. Next.js API Proxy / Rewrites

The Next.js application uses rewrites/proxy behavior so frontend requests can communicate with WordPress without unnecessarily exposing backend implementation details to every component.

Conceptually:

```text
Next.js
   │
   └── /wp-json/wp/v2/*
              │
              ▼
       WordPress REST API
```

The current `next.config.mjs` should be treated as the source of truth for the exact rewrite configuration.

---

# 10. Rendering Strategy

SEO is extremely important to PatientScure.

The project moved from a traditional SPA architecture to Next.js largely to improve:

* Server-side rendering
* Search engine crawlability
* Initial HTML content
* Metadata generation
* Core Web Vitals
* Performance
* Structured content delivery

For content pages, prefer server-rendered or statically generated content when possible.

Do not unnecessarily convert server components into client components.

When modifying a page, preserve the existing SSR/SSG strategy unless there is a strong technical reason to change it.

---

# 11. SEO Architecture

PatientScure is designed to be an SEO-driven content platform.

Important SEO areas include:

### Technical SEO

* SSR
* Metadata
* Canonical URLs
* Sitemap
* Robots.txt
* Structured data
* Clean URL structure
* Internal linking
* Fast page rendering
* Mobile performance

### Content SEO

Structured content exists for:

* Diseases
* Remedies
* Ingredients
* Articles

The goal is to create useful, interconnected content rather than isolated pages.

For example:

```text
Disease
   │
   ├── Related Remedies
   │       │
   │       └── Ingredients
   │
   └── Related Articles
```

and:

```text
Ingredient
   │
   ├── Related Remedies
   ├── Related Diseases
   └── Educational Content
```

---

# 12. AdSense

Google AdSense is active on PatientScure.

The Next.js application includes the AdSense script using an environment variable such as:

```text
NEXT_PUBLIC_ADSENSE_CLIENT
```

Ads must be implemented carefully because the project is also focused heavily on Core Web Vitals.

Avoid introducing unnecessary JavaScript, layout shifts, or render-blocking resources.

When modifying ad-related components, consider:

* LCP
* CLS
* INP
* script loading
* ad layout reservation
* mobile experience
* page speed

---

# 13. Performance

PatientScure is specifically being optimized for Google PageSpeed/Core Web Vitals.

A previous mobile PageSpeed test showed approximately:

```text
FCP: 5.7s
LCP: 9.3s
TBT: 50ms
CLS: 0.001
```

The main concerns included render-blocking resources and font loading.

Therefore:

> Performance is a first-class requirement of every frontend change.

Avoid:

* unnecessary client-side JavaScript
* unnecessary `"use client"`
* large dependencies
* blocking scripts
* oversized images
* unnecessary API calls
* layout shifts
* unnecessary third-party scripts

---

# 14. Fonts / Design System

The PatientScure frontend uses a modern editorial/health-oriented design system.

The current design direction includes:

### Headings

```text
Space Grotesk
```

### Body

```text
Jakarta Sans / similar modern sans-serif
```

The project has also used editorial-style utility classes such as:

```text
font-editorial
```

Do not introduce random fonts or typography styles into individual components.

Follow the existing global design system.

---

# 15. Rich Content

PatientScure contains rich WordPress-generated content.

A special styling system is used for WordPress rich content, including classes such as:

```text
.patientscure-rich-content
```

The rich content styling should visually match the rest of the Next.js application.

This includes:

* heading typography
* body typography
* line-height
* text colors
* lists
* tables
* links
* blockquotes
* images
* spacing
* responsive behavior

Do not style WordPress content as if it were an unrelated legacy website.

---

# 16. Content Data Model

The conceptual PatientScure data model is:

```text
                 ┌─────────────┐
                 │   Disease   │
                 └──────┬──────┘
                        │
                 related remedies
                        │
                        ▼
                 ┌─────────────┐
                 │   Remedy    │
                 └──────┬──────┘
                        │
                  uses ingredients
                        │
                        ▼
                 ┌─────────────┐
                 │ Ingredient  │
                 └─────────────┘
```

Articles provide an additional educational layer:

```text
Disease
  ↕
Remedy
  ↕
Ingredient
  ↕
Article
```

The goal is a structured knowledge graph-like content architecture.

---

# 17. Data Integrity

PatientScure is intended to provide reliable health information.

Content should not be casually invented or changed.

When creating structured health content:

* Preserve the requested schema.
* Keep factual claims appropriately qualified.
* Avoid unsupported medical claims.
* Preserve existing structured fields.
* Do not remove fields simply because they appear unused.
* Do not change API contracts without checking frontend dependencies.

The content system is designed to allow manually reviewed content to be published.

---

# 18. JSON Import System

PatientScure also uses structured JSON as a content-generation/import workflow.

For example, ingredient records use a structure containing:

```json
{
  "type": "ingredient"
}
```

The `type` field is important because the importer uses it to determine what kind of record is being processed.

Similarly, remedy records follow the project's established remedy JSON schema.

When generating new JSON for PatientScure, always match the existing project schema rather than inventing a new structure.

If an example JSON file is provided, treat it as the authoritative schema/template.

---

# 19. Important Development Rules

When working on PatientScure:

### Rule 1 — Inspect before changing

Do not assume the current architecture.

Inspect:

```text
package.json
next.config.mjs
app/
components/
services/
types/
WordPress setup plugin
```

before making architectural changes.

---

### Rule 2 — Preserve existing functionality

Do not rewrite working components unnecessarily.

Prefer small, targeted changes.

---

### Rule 3 — WordPress is the source of content

Do not duplicate content manually inside Next.js unless it is intentionally static configuration.

---

### Rule 4 — API contracts matter

Before changing an endpoint, field name, CPT slug, or response structure, check how the frontend consumes it.

---

### Rule 5 — SEO matters

Every public content page should be considered from the perspective of:

```text
Crawlability
Indexability
Metadata
Structured data
Internal linking
Performance
Canonical URLs
```

---

### Rule 6 — Performance matters

Avoid unnecessary client components and JavaScript.

Prefer server components wherever possible.

---

### Rule 7 — Do not break the design system

Use the existing typography, spacing, colors, components, and responsive patterns.

---

# 20. Current Technology Stack

### Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
App Router
Server Components
SSR / SSG
```

### Backend

```text
WordPress
WordPress REST API
Advanced Custom Fields Pro
Custom Post Types
Custom WordPress setup/plugin
```

### SEO

```text
Yoast SEO
Next.js Metadata API
XML Sitemap
Structured Data
Canonical URLs
```

### Infrastructure / Services

```text
Vercel
WordPress hosting
Cloudflare where applicable
Google AdSense
```

---

# 21. Current Development Objective

The broader objective is to turn PatientScure into a **fast, SEO-friendly, structured Ayurvedic health knowledge platform**.

The architecture should allow the project to scale to a large amount of structured content without turning the frontend into an unmaintainable collection of hard-coded pages.

The desired system is:

```text
                    CONTENT
                       │
                       ▼
              ┌─────────────────┐
              │    WordPress    │
              │      + ACF      │
              └────────┬────────┘
                       │
                       ▼
                 REST API
                       │
                       ▼
              ┌─────────────────┐
              │     Next.js     │
              │   Content API   │
              │     Layer       │
              └────────┬────────┘
                       │
                       ▼
              Server Components
                       │
                       ▼
              SEO / HTML Output
                       │
                       ▼
                 PatientScure
                       │
              ┌────────┴────────┐
              ▼                 ▼
            Users             Google
                              AdSense
```

---

# 22. How a New AI Agent Should Work on PatientScure

When an AI coding agent is introduced to this project, it should first understand:

1. This is a **headless WordPress + Next.js project**.
2. WordPress is the structured CMS/backend.
3. Next.js is the public frontend.
4. ACF is heavily used for structured content.
5. The REST API is the communication layer.
6. SEO is a primary requirement.
7. Core Web Vitals are a primary requirement.
8. Existing APIs and data structures should not be changed casually.
9. Existing UI/UX should be preserved unless explicitly asked to redesign it.
10. The repository is the source of truth for the current implementation.

Before making substantial changes, the agent should inspect the existing implementation rather than assuming the architecture described here is perfectly synchronized with the latest code.

---

# 23. Short Introduction

If a very short introduction is required, use this:

> **PatientScure is a headless health-content platform built with Next.js on the frontend and WordPress + ACF Pro on the backend. WordPress manages structured Diseases, Remedies, Ingredients and Articles through the REST API, while Next.js consumes that data using server-side rendering/static generation to provide a fast, SEO-focused public website. Yoast SEO, AdSense, structured content, internal linking and Core Web Vitals are important parts of the architecture. The project is designed to scale into a large, structured Ayurvedic health knowledge platform without hard-coding content into the frontend.**
=======
# PatientScure — Project & WordPress Backend API Introduction

## 1. Project Overview

**PatientScure** is a health and wellness information platform focused primarily on **Ayurvedic remedies, diseases, ingredients, and educational health content**.

The project is being built with a modern headless architecture:

**Frontend**

* Next.js
* React
* TypeScript
* Tailwind CSS
* Server-side rendering / static generation where appropriate
* SEO-focused architecture
* Google AdSense monetization

**Backend / CMS**

* WordPress
* WordPress REST API
* Advanced Custom Fields (ACF Pro)
* Custom Post Types
* Custom WordPress setup/plugin code
* Yoast SEO

The WordPress installation acts primarily as the **content management system and structured content API**, while the Next.js application acts as the public-facing website.

---

# 2. High-Level Architecture

The current architecture is:

```text
                    ┌──────────────────────┐
                    │      WordPress       │
                    │      Backend/CMS     │
                    │                      │
                    │  Posts               │
                    │  Diseases            │
                    │  Remedies             │
                    │  Ingredients          │
                    │  ACF Fields           │
                    │  Yoast SEO            │
                    └──────────┬───────────┘
                               │
                         WordPress REST API
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Next.js App      │
                    │      Frontend        │
                    │                      │
                    │ SSR / SSG             │
                    │ React Components      │
                    │ Tailwind CSS          │
                    │ SEO Metadata          │
                    │ Structured Content    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   PatientScure.com   │
                    │    Public Website    │
                    └──────────────────────┘
```

The important architectural principle is:

> **WordPress is the structured content backend. Next.js is the presentation layer.**

Do not turn the frontend into a traditional WordPress theme.

---

# 3. WordPress Backend

The WordPress installation contains structured content rather than simply being used as a traditional blogging CMS.

The primary content types are:

### Diseases

REST endpoint:

```text
/wp-json/wp/v2/disease
```

Used for disease/condition information.

A disease can contain structured information through ACF fields and relationships to remedies and other content.

---

### Remedies

REST endpoint:

```text
/wp-json/wp/v2/remedy
```

The project previously had an important REST configuration issue where the CPT `rest_base` was incorrectly configured as:

```text
remedys
```

instead of:

```text
remedies
```

This was corrected.

The frontend therefore expects the remedies API to be available through the correct REST route.

---

### Ingredients

REST endpoint:

```text
/wp-json/wp/v2/ingredient
```

Ingredients represent Ayurvedic/herbal/food ingredients used throughout the PatientScure content system.

Ingredient pages can contain structured information such as:

* Common name
* Botanical information
* Description
* Ayurvedic properties
* Traditional uses
* Benefits
* Precautions
* Related remedies
* Other structured ACF information

---

### Articles / Posts

The project also contains article content.

The frontend consumes WordPress article/post data through the REST API.

Some legacy WordPress posts have been migrated into the newer Article content structure.

Because URLs changed from the older structure to the newer:

```text
/article/{slug}
```

redirect handling has been implemented in the WordPress backend so old URLs do not unnecessarily become 404 pages.

---

# 4. ACF Pro

**Advanced Custom Fields Pro is a core part of the PatientScure backend architecture.**

WordPress provides the basic post/CPT framework while ACF provides structured fields.

The goal is to expose the relevant ACF data through the WordPress REST API so the Next.js frontend can consume the complete structured content.

The project has previously encountered issues where:

* ACF fields were not appearing in REST responses
* `show_in_rest` configuration needed attention
* Repeater fields were not appearing as expected
* CPT REST configuration caused endpoint problems

These should be considered when modifying the backend.

Do not assume that an ACF field is automatically available to the frontend simply because it exists in WordPress.

Whenever adding or changing ACF fields, verify that the data is actually exposed through:

```text
/wp-json/wp/v2/...
```

before modifying the frontend.

---

# 5. WordPress Setup Plugin

PatientScure uses custom WordPress setup code/plugin functionality to handle project-specific backend behavior.

There is a custom setup implementation commonly referred to as:

```text
patientscure-setup.php
```

This is used for project-specific WordPress functionality such as:

* CPT configuration
* REST API customization
* redirects
* backend hooks
* API modifications
* project-specific WordPress behavior

Before creating another plugin or adding duplicate functionality, inspect the existing PatientScure setup code.

Prefer extending existing project architecture over creating multiple overlapping plugins.

---

# 6. Yoast SEO

Yoast SEO is installed on the WordPress backend.

The project wants SEO information to remain available to the Next.js frontend wherever practical.

The WordPress REST API has been configured/verified so Yoast-related data can be exposed.

The long-term objective is to allow content editors to manage important SEO information from WordPress while the Next.js frontend renders the corresponding metadata.

SEO considerations include:

* SEO title
* Meta description
* Canonical URL
* Open Graph information
* Social metadata
* Article metadata
* Structured content
* Sitemap
* Robots directives where appropriate

Do not blindly duplicate Yoast functionality in Next.js if the same information already exists in WordPress.

---

# 7. Next.js Frontend

The frontend was originally developed as a Vite/React application and was later migrated to **Next.js App Router**.

The migration preserved the existing UI/UX while introducing server-side rendering and better SEO architecture.

The application uses:

```text
Next.js App Router
TypeScript
React
Tailwind CSS
```

Dynamic routes include concepts such as:

```text
/articles/[slug]
/diseases/[slug]
/remedies/[slug]
/ingredients/[slug]
```

The exact route structure should be inspected in the current repository before making assumptions.

---

# 8. ContentService

The frontend uses a centralized content/API layer, commonly referred to as:

```text
ContentService
```

This service is responsible for communicating with the WordPress REST API.

A key architectural decision was made for API URLs:

### Browser

The browser can use the Next.js proxy:

```text
/wp-json/wp/v2/...
```

### Server

Server-side rendering can use the WordPress API URL configured through environment variables.

The project previously used logic similar to:

```text
NEXT_PUBLIC_WORDPRESS_API_URL
```

for server-side API access.

The exact current implementation should always be checked in the repository before modifying it.

Do not hard-code API URLs throughout individual components.

---

# 9. Next.js API Proxy / Rewrites

The Next.js application uses rewrites/proxy behavior so frontend requests can communicate with WordPress without unnecessarily exposing backend implementation details to every component.

Conceptually:

```text
Next.js
   │
   └── /wp-json/wp/v2/*
              │
              ▼
       WordPress REST API
```

The current `next.config.mjs` should be treated as the source of truth for the exact rewrite configuration.

---

# 10. Rendering Strategy

SEO is extremely important to PatientScure.

The project moved from a traditional SPA architecture to Next.js largely to improve:

* Server-side rendering
* Search engine crawlability
* Initial HTML content
* Metadata generation
* Core Web Vitals
* Performance
* Structured content delivery

For content pages, prefer server-rendered or statically generated content when possible.

Do not unnecessarily convert server components into client components.

When modifying a page, preserve the existing SSR/SSG strategy unless there is a strong technical reason to change it.

---

# 11. SEO Architecture

PatientScure is designed to be an SEO-driven content platform.

Important SEO areas include:

### Technical SEO

* SSR
* Metadata
* Canonical URLs
* Sitemap
* Robots.txt
* Structured data
* Clean URL structure
* Internal linking
* Fast page rendering
* Mobile performance

### Content SEO

Structured content exists for:

* Diseases
* Remedies
* Ingredients
* Articles

The goal is to create useful, interconnected content rather than isolated pages.

For example:

```text
Disease
   │
   ├── Related Remedies
   │       │
   │       └── Ingredients
   │
   └── Related Articles
```

and:

```text
Ingredient
   │
   ├── Related Remedies
   ├── Related Diseases
   └── Educational Content
```

---

# 12. AdSense

Google AdSense is active on PatientScure.

The Next.js application includes the AdSense script using an environment variable such as:

```text
NEXT_PUBLIC_ADSENSE_CLIENT
```

Ads must be implemented carefully because the project is also focused heavily on Core Web Vitals.

Avoid introducing unnecessary JavaScript, layout shifts, or render-blocking resources.

When modifying ad-related components, consider:

* LCP
* CLS
* INP
* script loading
* ad layout reservation
* mobile experience
* page speed

---

# 13. Performance

PatientScure is specifically being optimized for Google PageSpeed/Core Web Vitals.

A previous mobile PageSpeed test showed approximately:

```text
FCP: 5.7s
LCP: 9.3s
TBT: 50ms
CLS: 0.001
```

The main concerns included render-blocking resources and font loading.

Therefore:

> Performance is a first-class requirement of every frontend change.

Avoid:

* unnecessary client-side JavaScript
* unnecessary `"use client"`
* large dependencies
* blocking scripts
* oversized images
* unnecessary API calls
* layout shifts
* unnecessary third-party scripts

---

# 14. Fonts / Design System

The PatientScure frontend uses a modern editorial/health-oriented design system.

The current design direction includes:

### Headings

```text
Space Grotesk
```

### Body

```text
Jakarta Sans / similar modern sans-serif
```

The project has also used editorial-style utility classes such as:

```text
font-editorial
```

Do not introduce random fonts or typography styles into individual components.

Follow the existing global design system.

---

# 15. Rich Content

PatientScure contains rich WordPress-generated content.

A special styling system is used for WordPress rich content, including classes such as:

```text
.patientscure-rich-content
```

The rich content styling should visually match the rest of the Next.js application.

This includes:

* heading typography
* body typography
* line-height
* text colors
* lists
* tables
* links
* blockquotes
* images
* spacing
* responsive behavior

Do not style WordPress content as if it were an unrelated legacy website.

---

# 16. Content Data Model

The conceptual PatientScure data model is:

```text
                 ┌─────────────┐
                 │   Disease   │
                 └──────┬──────┘
                        │
                 related remedies
                        │
                        ▼
                 ┌─────────────┐
                 │   Remedy    │
                 └──────┬──────┘
                        │
                  uses ingredients
                        │
                        ▼
                 ┌─────────────┐
                 │ Ingredient  │
                 └─────────────┘
```

Articles provide an additional educational layer:

```text
Disease
  ↕
Remedy
  ↕
Ingredient
  ↕
Article
```

The goal is a structured knowledge graph-like content architecture.

---

# 17. Data Integrity

PatientScure is intended to provide reliable health information.

Content should not be casually invented or changed.

When creating structured health content:

* Preserve the requested schema.
* Keep factual claims appropriately qualified.
* Avoid unsupported medical claims.
* Preserve existing structured fields.
* Do not remove fields simply because they appear unused.
* Do not change API contracts without checking frontend dependencies.

The content system is designed to allow manually reviewed content to be published.

---

# 18. JSON Import System

PatientScure also uses structured JSON as a content-generation/import workflow.

For example, ingredient records use a structure containing:

```json
{
  "type": "ingredient"
}
```

The `type` field is important because the importer uses it to determine what kind of record is being processed.

Similarly, remedy records follow the project's established remedy JSON schema.

When generating new JSON for PatientScure, always match the existing project schema rather than inventing a new structure.

If an example JSON file is provided, treat it as the authoritative schema/template.

---

# 19. Important Development Rules

When working on PatientScure:

### Rule 1 — Inspect before changing

Do not assume the current architecture.

Inspect:

```text
package.json
next.config.mjs
app/
components/
services/
types/
WordPress setup plugin
```

before making architectural changes.

---

### Rule 2 — Preserve existing functionality

Do not rewrite working components unnecessarily.

Prefer small, targeted changes.

---

### Rule 3 — WordPress is the source of content

Do not duplicate content manually inside Next.js unless it is intentionally static configuration.

---

### Rule 4 — API contracts matter

Before changing an endpoint, field name, CPT slug, or response structure, check how the frontend consumes it.

---

### Rule 5 — SEO matters

Every public content page should be considered from the perspective of:

```text
Crawlability
Indexability
Metadata
Structured data
Internal linking
Performance
Canonical URLs
```

---

### Rule 6 — Performance matters

Avoid unnecessary client components and JavaScript.

Prefer server components wherever possible.

---

### Rule 7 — Do not break the design system

Use the existing typography, spacing, colors, components, and responsive patterns.

---

# 20. Current Technology Stack

### Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
App Router
Server Components
SSR / SSG
```

### Backend

```text
WordPress
WordPress REST API
Advanced Custom Fields Pro
Custom Post Types
Custom WordPress setup/plugin
```

### SEO

```text
Yoast SEO
Next.js Metadata API
XML Sitemap
Structured Data
Canonical URLs
```

### Infrastructure / Services

```text
Vercel
WordPress hosting
Cloudflare where applicable
Google AdSense
```

---

# 21. Current Development Objective

The broader objective is to turn PatientScure into a **fast, SEO-friendly, structured Ayurvedic health knowledge platform**.

The architecture should allow the project to scale to a large amount of structured content without turning the frontend into an unmaintainable collection of hard-coded pages.

The desired system is:

```text
                    CONTENT
                       │
                       ▼
              ┌─────────────────┐
              │    WordPress    │
              │      + ACF      │
              └────────┬────────┘
                       │
                       ▼
                 REST API
                       │
                       ▼
              ┌─────────────────┐
              │     Next.js     │
              │   Content API   │
              │     Layer       │
              └────────┬────────┘
                       │
                       ▼
              Server Components
                       │
                       ▼
              SEO / HTML Output
                       │
                       ▼
                 PatientScure
                       │
              ┌────────┴────────┐
              ▼                 ▼
            Users             Google
                              AdSense
```

---

# 22. How a New AI Agent Should Work on PatientScure

When an AI coding agent is introduced to this project, it should first understand:

1. This is a **headless WordPress + Next.js project**.
2. WordPress is the structured CMS/backend.
3. Next.js is the public frontend.
4. ACF is heavily used for structured content.
5. The REST API is the communication layer.
6. SEO is a primary requirement.
7. Core Web Vitals are a primary requirement.
8. Existing APIs and data structures should not be changed casually.
9. Existing UI/UX should be preserved unless explicitly asked to redesign it.
10. The repository is the source of truth for the current implementation.

Before making substantial changes, the agent should inspect the existing implementation rather than assuming the architecture described here is perfectly synchronized with the latest code.

---

# 23. Short Introduction

If a very short introduction is required, use this:

> **PatientScure is a headless health-content platform built with Next.js on the frontend and WordPress + ACF Pro on the backend. WordPress manages structured Diseases, Remedies, Ingredients and Articles through the REST API, while Next.js consumes that data using server-side rendering/static generation to provide a fast, SEO-focused public website. Yoast SEO, AdSense, structured content, internal linking and Core Web Vitals are important parts of the architecture. The project is designed to scale into a large, structured Ayurvedic health knowledge platform without hard-coding content into the frontend.**
>>>>>>> a4ed021 (folder fixation)
