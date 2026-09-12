# Mastodon interoperability gate

Testagram's ActivityPub protocol origin is `https://federation.testagram.site`.

The application origin is `https://testagram.site`. The federation origin is intentionally separate because Vercel reserves `/.well-known` and cannot be used as the ActivityPub discovery authority.

## Required public routes

- `/.well-known/webfinger`
- `/.well-known/nodeinfo`
- `/nodeinfo/2.1`
- `/users/:username`
- `/users/:username/inbox`
- `/users/:username/outbox`
- `/users/:username/followers`
- `/users/:username/following`
- `/users/:username/notes/:id`
- `/inbox`

## Mastodon matrix

1. WebFinger `acct:user@federation.testagram.site` resolves to the actor.
2. Actor exposes a valid RSA public key and inbox/outbox/collection URLs.
3. Mastodon sends `Follow`; Testagram verifies the HTTP signature, persists the relationship, and returns `Accept`.
4. Testagram publishes `Create` to the remote follower's inbox/sharedInbox with a valid digest and HTTP signature.
5. Mastodon sends `Create`; Testagram verifies the sender and materializes the Note.
6. Mastodon sends `Like`; Testagram records the remote engagement.
7. Mastodon sends `Announce`; Testagram records the remote boost.
8. Mastodon sends `Undo` for Like/Announce; Testagram reconciles the interaction state.
9. Mastodon sends `Update`; Testagram refreshes the remote object.
10. Mastodon sends `Delete`; Testagram removes or tombstones the remote object.
11. Replies resolve through `inReplyTo` and remote object dereferencing.
12. Quote requests/approvals follow Testagram's existing quote federation state machine.
13. Repeated activity delivery is idempotent.
14. Invalid/stale/mismatched signatures are rejected.
15. Public Note dereferencing returns Mastodon-compatible ActivityPub JSON.

A live public protocol smoke test can validate discovery and negative signature paths automatically. The positive account-to-account matrix must be run against a real Mastodon instance with an actual test account; CI must never manufacture a successful federation result.
