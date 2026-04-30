# Track My Rent Frontend Tutorials

These files are frontend-ready tutorial assets prepared from the backend workspace.

## Suggested frontend structure

```text
css/
  tutorial.css

js/
  tutorial-markup.js
  tutorial-engine.js
  tutorials-page.js
  tutorials/
    catalog.js
    business-settings-tutorial.js
    properties-tutorial.js
    tenants-tutorial.js
    leases-tutorial.js
    payments-tutorial.js
    reports-tutorial.js
```

## How to use on a page

1. Add the shared stylesheet:

```html
<link rel="stylesheet" href="css/tutorial.css" />
```

2. Add a button:

```html
<button id="startTutorialBtn" type="button" class="tutorial-trigger">
  Start tutorial
</button>
```

3. Mark important elements with `data-tutorial`:

```html
<input data-tutorial="business-name" />
<button data-tutorial="save-business-settings">Save Changes</button>
```

4. Load the shared files and the page config:

```html
<script src="js/tutorial-markup.js"></script>
<script src="js/tutorial-engine.js"></script>
<script src="js/tutorials/business-settings-tutorial.js"></script>
```

## Tutorials page

On `tutorials.html`, add a container:

```html
<section id="tutorialGrid" class="tutorial-grid"></section>
```

Then load:

```html
<link rel="stylesheet" href="css/tutorial.css" />
<script src="js/tutorials/catalog.js"></script>
<script src="js/tutorials-page.js"></script>
```
