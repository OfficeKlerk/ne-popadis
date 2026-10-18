/* Small compatibility helpers; no browser extensions or native APIs required. */
(function () {
  "use strict";
  window.GamePlatform = {
    block: function (surface, blocked) {
      // inert arrived after iOS 15.0. CSS, ARIA and the modal focus trap also work without it.
      surface.inert = blocked;
      surface.classList.toggle("input-blocked", blocked);
      if (blocked) surface.setAttribute("aria-hidden", "true");
      else surface.removeAttribute("aria-hidden");
    }
  };
})();
