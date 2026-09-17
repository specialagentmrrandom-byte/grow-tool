import { describe, it, expect } from 'vitest';
import {
    buildOvergrowNewTopicUrl,
    willTruncateForUrl,
    OVERGROW_URL,
    OVERGROW_NEW_TOPIC_BODY_LIMIT,
    OVERGROW_TRUNCATION_NOTE,
} from '../src/overgrow';

describe('buildOvergrowNewTopicUrl', () => {
    it('points at the Overgrow new-topic composer', () => {
        const url = buildOvergrowNewTopicUrl({ title: 'My Grow', body: 'Hello' });
        expect(url.startsWith(`${OVERGROW_URL}/new-topic?`)).toBe(true);
    });

    it('encodes the title and body as query params', () => {
        const url = buildOvergrowNewTopicUrl({
            title: 'Northern Lights #5',
            body: '# Day 1\n\nSeeds planted & soaked.',
        });
        const parsed = new URL(url);
        expect(parsed.searchParams.get('title')).toBe('Northern Lights #5');
        expect(parsed.searchParams.get('body')).toBe('# Day 1\n\nSeeds planted & soaked.');
    });

    it('appends optional tags as repeated tags[] params', () => {
        const url = buildOvergrowNewTopicUrl(
            { title: 't', body: 'b' },
            ['grow-diary', 'autoflower'],
        );
        const parsed = new URL(url);
        expect(parsed.searchParams.getAll('tags[]')).toEqual(['grow-diary', 'autoflower']);
    });

    it('trims an over-long body and adds the clipboard note', () => {
        const longBody = 'x'.repeat(OVERGROW_NEW_TOPIC_BODY_LIMIT + 500);
        const url = buildOvergrowNewTopicUrl({ title: 't', body: longBody });
        const body = new URL(url).searchParams.get('body')!;
        expect(body.length).toBe(OVERGROW_NEW_TOPIC_BODY_LIMIT + OVERGROW_TRUNCATION_NOTE.length);
        expect(body.endsWith(OVERGROW_TRUNCATION_NOTE)).toBe(true);
    });

    it('leaves a short body untouched', () => {
        const url = buildOvergrowNewTopicUrl({ title: 't', body: 'short body' });
        expect(new URL(url).searchParams.get('body')).toBe('short body');
    });
});

describe('willTruncateForUrl', () => {
    it('is false for short bodies and true past the limit', () => {
        expect(willTruncateForUrl('short')).toBe(false);
        expect(willTruncateForUrl('x'.repeat(OVERGROW_NEW_TOPIC_BODY_LIMIT + 1))).toBe(true);
    });
});
