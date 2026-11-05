(async () => {
  const looks = await (await fetch("/preview/looks.json")).json(),
    select = document.getElementById("look"),
    frame = document.getElementById("extension");
  for (const look of looks) {
    const option = document.createElement("option");
    option.value = look.id;
    option.textContent = look.name;
    select.append(option);
  }
  select.value =
    looks.find((l) => l.name === "Quiet Minimal")?.id || looks[0].id;
  const apply = () =>
    frame.contentWindow.postMessage(
      {
        type: "preview-appearance",
        appearance: looks.find((l) => l.id === select.value).appearance,
      },
      location.origin,
    );
  select.addEventListener("change", apply);
  frame.addEventListener("load", apply);
  apply();
  document.getElementById("surface").addEventListener("change", (e) => {
    document.body.classList.toggle("popup", e.target.value === "popup");
    frame.src =
      "/popup/popup.html?preview=1" +
      (e.target.value === "panel" ? "&panel=1" : "");
  });
  window.addEventListener("message", (e) => {
    if (
      e.origin === location.origin &&
      e.source === frame.contentWindow &&
      e.data?.type === "preview-ready"
    )
      apply();
  });
})();
