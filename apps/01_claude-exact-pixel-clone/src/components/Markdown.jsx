import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
export default function Markdown({ children, onExternalLink }) {
  // No raw HTML plugin. Model/page HTML is source data, never app DOM.
  // Neither images nor a browser's middle-click/context-menu link navigation
  // may send a model-controlled private URL before the destination is approved.
  return <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown" components={{
    a: ({ node, href, ...props }) => !/^https?:\/\//i.test(href || '') ? <span {...props} /> : <a {...props} href="#external-link" onClick={event => { event.preventDefault(); onExternalLink?.(href) }} onAuxClick={event => { if (event.button === 1) { event.preventDefault(); onExternalLink?.(href) } }} />,
    img: ({ alt }) => <span className="blocked-image">[Image not fetched: {alt || 'external image'}]</span>,
  }}>{children}</ReactMarkdown>
}
