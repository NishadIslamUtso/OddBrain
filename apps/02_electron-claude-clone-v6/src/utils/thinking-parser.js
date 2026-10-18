/**
 * Extracts thinking content from response text
 * Looks for <think>...</think> or <thinking>...</thinking> tags
 * Returns { thinking, response, hasThinking }
 */
export function extractThinkingContent(text) {
    if (!text || typeof text !== 'string') {
        return {
            thinking: null,
            response: text || '',
            hasThinking: false
        };
    }

    // Pattern to match <think>...</think> or <thinking>...</thinking>
    const thinkPattern = /<think>([\s\S]*?)<\/think>/gi;
    const thinkingPattern = /<thinking>([\s\S]*?)<\/thinking>/gi;

    let thinking = null;
    let response = text;

    // Try <think> tags first
    const thinkMatch = text.match(thinkPattern);
    if (thinkMatch && thinkMatch.length > 0) {
        // Extract all thinking content
        thinking = thinkMatch
            .map(match => match.replace(/<\/?think>/gi, '').trim())
            .join('\n\n');

        // Remove thinking from response
        response = text.replace(thinkPattern, '').trim();
    }

    // If no <think> found, try <thinking> tags
    if (!thinking) {
        const thinkingMatch = text.match(thinkingPattern);
        if (thinkingMatch && thinkingMatch.length > 0) {
            thinking = thinkingMatch
                .map(match => match.replace(/<\/?thinking>/gi, '').trim())
                .join('\n\n');

            response = text.replace(thinkingPattern, '').trim();
        }
    }

    // Only return hasThinking: true if thinking has actual content
    const hasThinking = thinking && thinking.trim().length > 0;

    return {
        thinking: hasThinking ? thinking : null,
        response,
        hasThinking
    };
}

/**
 * Check if text contains any thinking tags (for quick detection)
 */
export function hasThinkingTags(text) {
    if (!text || typeof text !== 'string') return false;
    return /<think>/i.test(text) || /<thinking>/i.test(text);
}
