// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ArtifactsScreen } from '../src/renderer/src/screens/ArtifactsScreen'
import { emptyWorkspace, type Workspace } from '../src/shared/workspace'

afterEach(cleanup)

describe('artifact surface', () => {
  it('imports an inert preview, saves a revision and recovers its versions from Trash', async () => {
    const user = userEvent.setup()
    const notice = vi.fn()
    function Harness() {
      const [data, setData] = useState<Workspace>(emptyWorkspace)
      return (
        <ArtifactsScreen
          data={data}
          notice={notice}
          update={async (change) => {
            setData((before) => change(before))
            return true
          }}
        />
      )
    }
    render(<Harness />)
    const unsafe = '<html><script>window.parent.alert("escape")</script><h1>Imported</h1></html>'
    const file = new File([unsafe], 'unsafe.html', { type: 'text/html' })
    // jsdom's File omits Blob.text; real browser Files implement it.
    Object.defineProperty(file, 'text', { value: async () => unsafe })
    fireEvent.change(screen.getByLabelText('Import artifact file'), { target: { files: [file] } })
    expect(await screen.findByRole('button', { name: 'Open unsafe.html' })).toBeTruthy()
    const preview = screen.getByTitle('Preview unsafe.html')
    expect(preview.getAttribute('sandbox')).toBe('')
    expect(preview.getAttribute('srcdoc')).toContain("default-src 'none'")
    expect(preview.getAttribute('srcdoc')).toContain(unsafe)
    await user.click(screen.getByRole('button', { name: 'Edit as new version' }))
    await user.clear(screen.getByRole('textbox', { name: 'Artifact source' }))
    await user.type(screen.getByRole('textbox', { name: 'Artifact source' }), '<h1>Revision two</h1>')
    await user.click(screen.getByRole('button', { name: 'Save new version' }))
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Artifact version' }).querySelectorAll('option'),
      ).toHaveLength(2),
    )
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }))
    await user.click(screen.getByRole('button', { name: /Trash \(1\)/ }))
    await user.click(screen.getByRole('button', { name: 'Recover' }))
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Artifact version' }).querySelectorAll('option'),
      ).toHaveLength(2),
    )
    expect(screen.getByTitle('Preview unsafe.html').getAttribute('sandbox')).toBe('')
  })
})
