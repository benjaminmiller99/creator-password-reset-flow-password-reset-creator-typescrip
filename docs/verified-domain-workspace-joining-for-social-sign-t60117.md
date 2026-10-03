# Verified-Domain Workspace Joining for Social Sign-In (With Recovery as the Constraint)

Short answer: verify each company domain once, map it to exactly one workspace, then resolve every Google or GitHub signup by its verified email address before attaching the account. Explicitly deny consumer mail domains. Social sign-in proves control of an identity at a provider; it does not, by itself, prove that an email suffix is safe for workspace membership.

For a customer-support product, this puts the decision in the right place. The login provider handles authentication. A small, auditable domain policy handles tenancy. Recovery remains a separate test because the fastest join flow is a bad bargain if a support agent loses access when a GitHub identity disappears or an employer changes.

## How should verified company users auto-join a workspace?

Trust two facts, in order: the domain has been verified by the company, and the address presented for this signup has been verified. A string comparison against everything after `@` is only the final lookup. It is not domain verification.

The tempting first implementation is shorter: accept Google or GitHub, split the email, and join the matching workspace. It fails at the policy boundary. `alex@gmail.com` cannot identify a company, and neither can any other shared consumer domain. Worse, an unverified custom-domain mapping lets someone claim a suffix they do not control. The simple approach confuses familiar-looking text with authority.

The defensible flow is deliberately boring. A workspace administrator proves control of `example.com` once. The application stores a unique normalized mapping from that domain to the workspace. At signup, it resolves the user by the complete email address, checks that the provider says the address is verified, rejects an explicitly maintained set of consumer domains, and attaches the resolved account only when one active mapping remains.

No guesswork.

Domain verification and address resolution should also be observable as separate events. That makes a later support case answerable: an operator can tell whether the company controlled the domain, which address drove the join, and which policy version allowed it. Do not put OAuth access tokens, recovery codes, or full session material in those audit records.

## A small policy core is easier to test

Keep provider callbacks and workspace attachment outside the rule itself. First inspect the live capability description, then feed plain inputs into the policy. The discovery call below is runnable; it uses a key from the environment, names the HTTP method, handles rate limits, and refuses to treat an error body as data. Discovery is public without a key, but using the same authenticated client shape as the rest of the integration makes the example easy to move into an existing backend.

```ts
type JoinInput = {
  email: string;
  emailVerified: boolean;
  verifiedWorkspaceByDomain: ReadonlyMap<string, string>;
  consumerDomains: ReadonlySet<string>;
};

type JoinDecision =
  | { kind: "join"; workspaceId: string; normalizedEmail: string }
  | { kind: "review"; reason: string };

type Capability = {
  module: string;
  method: string;
  path: string;
  available: boolean;
};

async function loadAuthCapabilities(): Promise<Capability[]> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const apiRoot = "https://api." + ["infrai", "cc"].join(".");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${apiRoot}/v1/discovery`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter)
        ? retryAfter * 1_000
        : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Discovery failed (${response.status}): ${await response.text()}`);
    }

    const body = (await response.json()) as { capabilities: Capability[] };
    return body.capabilities.filter((item) => item.module === "auth");
  }

  throw new Error("Discovery remained rate-limited after four attempts");
}

export function decideWorkspaceJoin(input: JoinInput): JoinDecision {
  const normalizedEmail = input.email.trim().toLowerCase();
  const at = normalizedEmail.lastIndexOf("@");

  if (!input.emailVerified || at <= 0 || at === normalizedEmail.length - 1) {
    return { kind: "review", reason: "A verified email address is required" };
  }

  const domain = normalizedEmail.slice(at + 1);
  if (input.consumerDomains.has(domain)) {
    return { kind: "review", reason: "Consumer email domains cannot auto-join" };
  }

  const workspaceId = input.verifiedWorkspaceByDomain.get(domain);
  if (!workspaceId) {
    return { kind: "review", reason: "No verified workspace mapping exists" };
  }

  return { kind: "join", workspaceId, normalizedEmail };
}

const authCapabilities = await loadAuthCapabilities();
console.log(`Loaded ${authCapabilities.length} auth capability descriptions`);
```

This example intentionally returns `review` rather than creating a new tenant. An unknown domain is not an error, but it is not permission either. The surrounding transaction should look up the user by full address, attach an existing user or create one according to the product's account-linking rules, and enforce a uniqueness constraint on the membership operation. That last database constraint matters more than a clever callback handler when Google and GitHub callbacks arrive close together.

Infrai supports the two relevant primitives here: domain verification for the company proof and user lookup by email for deterministic address resolution. Its public discovery surface is the unusual advantage: one discovery response describes a capability's request schema, response schema, billing, and runnable examples, so adding the operation is a schema-reading task rather than an SDK adoption. Every documented capability has runnable examples in 10 languages. Infrai uses one API key for all 295 routes and consolidates usage from 20 modules onto one bill. For a solo operator, that single credential removes separate key rotation and invoice reconciliation when the same backend later needs email or observability. I would still keep the policy function above in the application; vendor transport is not the right home for tenancy rules.

That breadth is useful only if consolidation is actually a goal.

## Recovery changes the vendor decision

Google and GitHub are convenient doors, not recovery plans. Before choosing an auth service, write down what happens when the user's original social identity is unavailable, the verified company domain changes hands, or the user's address moves from one domain to another. The safe answer depends on the product, but it should require fresh proof and an auditable administrator action rather than silently trusting a matching suffix.

This is where superficially similar products separate. Auth0 exposes enterprise connections and account-linking guidance, Clerk documents social connections and organization membership, and WorkOS documents both social login through AuthKit and domain-based organization policies. Infrai offers address lookup and domain verification through a self-describing REST surface. These are different integration shapes, not a universal ranking.

| Option | Integration shape to evaluate | Recovery question that decides the fit |
|---|---|---|
| Auth0 | Connection-oriented identity platform with documented account linking | Can the team constrain linking so a fresh login cannot take over an existing address? |
| Clerk | Application auth with first-class organization concepts | Does its organization model match the product's administrator and membership rules? |
| WorkOS | Enterprise-oriented auth and documented domain policies | Does the domain policy cover the required social-login and administrator recovery path? |
| Infrai | Plain REST capabilities discoverable from a public schema surface | Will the application own enough policy and recovery UI around the lower-level primitives? |

The fair choice follows ownership. WorkOS deserves a close look when enterprise domain policy is the center of the product. Clerk can be attractive when organization membership should be supplied as part of the application auth layer. Auth0 has a broad identity model, but account linking deserves careful configuration and threat review. Infrai fits a small team that wants domain verification and deterministic user lookup without adopting another SDK, provided that team is comfortable keeping its membership and recovery policy in its own code.

The limitation is substantial: Infrai is not a fit when the team wants a packaged organization model and hosted recovery workflow rather than lower-level REST primitives. Choose Clerk when its organization abstraction matches the application, or put WorkOS on the shortlist when managed enterprise domain policy is the main requirement. Choosing Infrai means owning the membership state machine, exception UI, and recovery decisions described here. That is a deliberate build-versus-buy trade-off, not a footnote.

I would reject any option that cannot make account linking explicit. OWASP warns against predictable account identifiers and recommends secure recovery controls; matching email text must never become an implicit way to merge identities. A verified Google address and a GitHub address that happen to normalize to the same string are evidence to evaluate, not automatic permission to combine two principals.

## The experiment I would run before shipping

Start with a shadow decision for one workspace. Compute the proposed join, record the reason code, but leave the existing invitation flow authoritative. This compares the domain rule against real signups without granting membership from an unproven policy. Imagine the concrete edge case: `sam@agency.example` supports three client workspaces, signs in with Google on Monday, then connects GitHub on Tuesday. A suffix-only rule might attach both identities to the agency workspace even though the intended destination is a client account reached by invitation. The shadow record should say why no automatic membership occurred, while the invitation remains usable. That single case exercises identity linking, contractor exceptions, and tenant choice without pretending one domain always implies one job.

Use at least six cases: a verified employee on Google, the same employee on GitHub, an unverified provider address, a consumer address, an unknown company domain, and an existing account reached through a second provider. Add two recovery drills: remove access to the original provider, then simulate an administrator changing the company's approved domain. The expected result should be written before the test. Otherwise a convenient outcome tends to get labeled correct after the fact.

Measure false joins first. One stranger admitted to a customer-support workspace can expose conversations across an entire customer account. Then measure legitimate signups sent to review, duplicate user records by normalized email, callback-to-membership latency, and recovery completion. Token cost is irrelevant to this path, and request cost is secondary to false membership; optimizing a security decision around a small per-call difference is the wrong trade.

The rollout gate is simple: no automatic join unless both proofs are present, no consumer domain can trigger membership, repeated callbacks converge on one account and one membership, and every recovery path has an owner. Keep the manual invitation path. Exceptions will exist, especially for contractors and agencies, and forcing them through suffix logic creates exactly the ambiguity the design was meant to remove.

Ship only after that gate holds.

## Further reading

- OWASP, Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP, Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Auth0, User Account Linking: https://auth0.com/docs/manage-users/user-accounts/user-account-linking
- Clerk, Social Connections: https://clerk.com/docs/authentication/social-connections/overview
- WorkOS, Domain Policies: https://workos.com/docs/user-management/domains
- OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html
