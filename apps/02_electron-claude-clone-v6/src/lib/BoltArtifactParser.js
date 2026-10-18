/**
 * Parses streaming XML-like tags for Build Mode artifacts.
 * Handles <boltArtifact> and <boltAction> tags.
 */
export class BoltArtifactParser {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.buffer = '';
        this.currentArtifact = null;
        this.currentAction = null;
    }

    /**
     * Parse a chunk of text from the stream.
     * @param {string} chunk - New text chunk
     */
    parse(chunk) {
        this.buffer += chunk;
        this._processBuffer();
    }

    _processBuffer() {
        let processedIndex = 0;

        // Simple state machine loop
        while (processedIndex < this.buffer.length) {
            const remaining = this.buffer.slice(processedIndex);

            if (!this.currentArtifact) {
                // Look for <boltArtifact>
                const startTag = '<boltArtifact';
                const startIndex = remaining.indexOf(startTag);

                if (startIndex !== -1) {
                    // Check if we have the full opening tag
                    const endTagIndex = remaining.indexOf('>', startIndex);
                    if (endTagIndex !== -1) {
                        const tagContent = remaining.slice(startIndex, endTagIndex + 1);
                        const attributes = this._parseAttributes(tagContent);

                        this.currentArtifact = { ...attributes };
                        if (this.callbacks.onArtifactStart) {
                            this.callbacks.onArtifactStart(this.currentArtifact);
                        }

                        processedIndex += startIndex + endTagIndex + 1;
                        continue;
                    }
                }
            } else if (!this.currentAction) {
                // Look for <boltAction> or </boltArtifact>
                const actionStartTag = '<boltAction';
                const artifactEndTag = '</boltArtifact>';

                const actionIndex = remaining.indexOf(actionStartTag);
                const artifactEndIndex = remaining.indexOf(artifactEndTag);

                // Check which comes first
                if (artifactEndIndex !== -1 && (actionIndex === -1 || artifactEndIndex < actionIndex)) {
                    // Artifact ended
                    if (this.callbacks.onArtifactEnd) {
                        this.callbacks.onArtifactEnd();
                    }
                    this.currentArtifact = null;
                    processedIndex += artifactEndIndex + artifactEndTag.length;
                    continue;
                }

                if (actionIndex !== -1) {
                    // Check if we have full opening tag
                    const endTagIndex = remaining.indexOf('>', actionIndex);
                    if (endTagIndex !== -1) {
                        const tagContent = remaining.slice(actionIndex, endTagIndex + 1);
                        const attributes = this._parseAttributes(tagContent);

                        this.currentAction = { ...attributes, content: '' };
                        if (this.callbacks.onActionStart) {
                            this.callbacks.onActionStart(this.currentAction);
                        }

                        processedIndex += actionIndex + endTagIndex + 1;
                        continue;
                    }
                }
            } else {
                // Inside an action, look for </boltAction>
                const actionEndTag = '</boltAction>';
                const endIndex = remaining.indexOf(actionEndTag);

                if (endIndex !== -1) {
                    // Action ended
                    const content = remaining.slice(0, endIndex);
                    this.currentAction.content += content;

                    if (this.callbacks.onActionContent) {
                        this.callbacks.onActionContent(this.currentAction, content);
                    }

                    if (this.callbacks.onActionEnd) {
                        this.callbacks.onActionEnd(this.currentAction);
                    }

                    this.currentAction = null;
                    processedIndex += endIndex + actionEndTag.length;
                    continue;
                } else {
                    // No end tag yet. Consuming everything is risky if the chunk ends in the middle of </boltAction>
                    // We need to keep the last few characters in the buffer just in case they are the start of the end tag
                    const closingTag = '</boltAction>';
                    const possiblePartialTagLength = closingTag.length - 1;

                    // If remaining text is shorter than possible tag, keep all of it
                    if (remaining.length <= possiblePartialTagLength) {
                        break;
                    }

                    // Otherwise consume up to length - possiblePartialTagLength
                    const safeLength = remaining.length - possiblePartialTagLength;
                    const content = remaining.slice(0, safeLength);

                    if (content) {
                        this.currentAction.content += content;
                        if (this.callbacks.onActionContent) {
                            this.callbacks.onActionContent(this.currentAction, content);
                        }
                        processedIndex += safeLength;
                    }
                    break; // Wait for more data
                }
            }

            break; // Nothing found, wait for more data
        }

        // Remove processed part from buffer
        this.buffer = this.buffer.slice(processedIndex);
    }

    _parseAttributes(tag) {
        const attributes = {};
        const regex = /(\w+)="([^"]*)"/g;
        let match;
        while ((match = regex.exec(tag)) !== null) {
            attributes[match[1]] = match[2];
        }
        return attributes;
    }
}
