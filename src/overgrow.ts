/**
 * Overgrow community integration.
 *
 * Overgrow.com is a Discourse forum, and Discourse lets you open the topic
 * composer with the title and body pre-filled via a `/new-topic` URL. That's
 * how "prepare a forum topic from within the app" works: we generate the post
 * (see store.getForumTopicDraft) and hand the grower a link that opens Overgrow
 * with everything typed out for them. No API, no login flow, no server — fully
 * offline-friendly up until the moment they click through.
 *
 * Keep all Overgrow URLs and link-building here so the rest of the app has a
 * single place to read from (and so the base URL is trivial to change if the
 * cooperation ever points at a different community or category).
 */

export const OVERGROW_URL = 'https://overgrow.com';

/** Growroom Diaries category — the natural home for a grow log. */
export const OVERGROW_DIARIES_URL =
    'https://overgrow.com/c/indoor-growing/growroom-diaries/15';

/**
 * Discourse renders the composer client-side, and very long URLs get unwieldy
 * (some browsers and proxies balk well before the theoretical limit). We pre-fill
 * up to this many characters of the body and rely on the clipboard copy for the
 * full post, so the grower never loses content.
 */
export const OVERGROW_NEW_TOPIC_BODY_LIMIT = 6000;

/** Note appended when the body had to be trimmed for the URL. */
export const OVERGROW_TRUNCATION_NOTE =
    '\n\n_…the full grow report has been copied to your clipboard — paste it here to replace this note._';

export interface ForumTopicDraft {
    title: string;
    body: string;
}

/**
 * Build a Discourse "new topic" URL for Overgrow with the title and body
 * pre-filled. The body is trimmed to OVERGROW_NEW_TOPIC_BODY_LIMIT so the URL
 * stays reasonable; callers should also copy the full body to the clipboard.
 *
 * `tags` are optional; we don't force a category, because pre-selecting one only
 * works if it exists and the user can post there — letting them pick in the
 * composer is friendlier and never errors.
 */
export function buildOvergrowNewTopicUrl(draft: ForumTopicDraft, tags: string[] = []): string {
    const params = new URLSearchParams();
    params.set('title', draft.title);

    let body = draft.body;
    if (body.length > OVERGROW_NEW_TOPIC_BODY_LIMIT) {
        body = body.slice(0, OVERGROW_NEW_TOPIC_BODY_LIMIT) + OVERGROW_TRUNCATION_NOTE;
    }
    params.set('body', body);

    if (tags.length > 0) {
        // Discourse accepts repeated tags[] params.
        for (const tag of tags) params.append('tags[]', tag);
    }

    return `${OVERGROW_URL}/new-topic?${params.toString()}`;
}

/** Whether a draft's body will be trimmed when placed in the composer URL. */
export function willTruncateForUrl(body: string): boolean {
    return body.length > OVERGROW_NEW_TOPIC_BODY_LIMIT;
}
