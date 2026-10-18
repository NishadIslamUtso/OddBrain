// Set defaults for AI ASSistant to use existing qwen2.5:3b directly
if (!localStorage.getItem('selected_provider')) {
  localStorage.setItem('selected_provider', 'ollama');
}
if (!localStorage.getItem('selected_model')) {
  localStorage.setItem('selected_model', 'qwen2.5:3b');
}