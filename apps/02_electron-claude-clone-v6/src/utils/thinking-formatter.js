/**
 * Open-WebUI style thinking formatter
 * Transforms <think>...</think> and <thinking>...</thinking> into collapsible HTML details
 */
export class ThinkingFormatter {
    constructor() {
        this.startTime = null;
    }

    /**
     * Call this when streaming starts
     */
    startTiming() {
        this.startTime = Date.now();
    }

    /**
     * Calculate elapsed time in seconds
     */
    getElapsedSeconds() {
        if (!this.startTime) return 0;
        return Math.round((Date.now() - this.startTime) / 1000);
    }

    /**
     * Check if content has thinking tags
     */
    hasThinking(content) {
        if (!content || typeof content !== 'string') return false;
        return /<think>|<thinking>/i.test(content);
    }

    /**
     * Format thinking tags into collapsible sections
     * @param {string} content - Raw content with <think> tags
     * @returns {string} - Formatted content with <details> tags
     */
    formatThinking(content) {
        if (!content || typeof content !== 'string') {
            return content;
        }

        const durationSeconds = this.getElapsedSeconds();
        const durationText = durationSeconds > 0 ? ` for ${durationSeconds}s` : '';

        // Replace <think>...</think> with <details>...<summary>
        let formatted = content.replace(
            /<think>([\s\S]*?)<\/think>/gi,
            (match, thinkingContent) => {
                if (!thinkingContent || !thinkingContent.trim()) {
                    return ''; // Remove empty thinking blocks
                }
                return `<details class="thinking-block">
<summary class="thinking-summary">💭 Thought${durationText}</summary>

${thinkingContent.trim()}

</details>`;
            }
        );

        // Also handle <thinking>...</thinking> tags
        formatted = formatted.replace(
            /<thinking>([\s\S]*?)<\/thinking>/gi,
            (match, thinkingContent) => {
                if (!thinkingContent || !thinkingContent.trim()) {
                    return '';
                }
                return `<details class="thinking-block">
<summary class="thinking-summary">💭 Thought${durationText}</summary>

${thinkingContent.trim()}

</details>`;
            }
        );

        return formatted;
    }

    /**
     * Remove all thinking content and tags from content
     * Useful for copy-to-clipboard functionality
     */
    removeThinking(content) {
        if (!content || typeof content !== 'string') return content;

        return content
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, '')
            .trim();
    }
}

// Singleton instance for convenience
export const thinkingFormatter = new ThinkingFormatter();
