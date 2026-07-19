export const BROWSER_FIXTURE_VIEWPORT_SIZE = 50;

export const RED_10X10_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

function createSolidColorStoryUrl(id: string, color: 'red' | 'blue'): string {
  const html = `<style>html,body{margin:0}</style><div id="${id}" style="width:10px;height:10px;background:${color}"></div>`;
  return `data:text/html,${encodeURIComponent(html)}`;
}

export const RED_TARGET_STORY_URL = createSolidColorStoryUrl('target', 'red');
export const BLUE_TARGET_STORY_URL = createSolidColorStoryUrl('target', 'blue');
export const RED_TEST_STORY_URL = createSolidColorStoryUrl('test', 'red');
