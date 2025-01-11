browser.webNavigation.onDOMContentLoaded.addListener((details) => {
  browser.tabs.executeScript(details.tabId, {
    file: "main.js",
  });
});
