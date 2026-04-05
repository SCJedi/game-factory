# Templates

Project templates for the factory. The default Phaser + Vite template is built into `factory.js` directly.

To add a new template:

1. Create a subdirectory here (e.g., `templates/phaser-matter/`).
2. Add the template files with placeholder variables.
3. Update `factory.js` to read from this directory when `factory-config.json` specifies your template name.

Currently unused - the built-in template covers the standard Phaser 3 + Vite + Arcade Physics setup.
