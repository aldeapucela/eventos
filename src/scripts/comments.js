function normalizeCommentCount(topicPayload) {
  const posts = Array.isArray(topicPayload?.post_stream?.posts)
    ? topicPayload.post_stream.posts
    : [];

  if (!posts.length) {
    const replyCount = Number(topicPayload?.reply_count ?? 0);
    return Math.max(replyCount, 0);
  }

  const visibleReplies = posts.filter((post) => {
    if (!post || Number(post.post_number) <= 1) {
      return false;
    }

    if (post.hidden || post.deleted_at) {
      return false;
    }

    if (post.post_type !== 1) {
      return false;
    }

    return true;
  });

  return visibleReplies.length;
}

function normalizeLatestTopicPostNumber(topicPayload) {
  const highestPostNumber = Number(topicPayload?.highest_post_number ?? 0);

  if (highestPostNumber > 1) {
    return highestPostNumber;
  }

  const streamPostNumbers = Array.isArray(topicPayload?.post_stream?.stream)
    ? topicPayload.post_stream.stream
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 1)
    : [];

  if (streamPostNumbers.length) {
    return Math.max(...streamPostNumbers);
  }

  const posts = Array.isArray(topicPayload?.post_stream?.posts)
    ? topicPayload.post_stream.posts
    : [];
  const visiblePostNumbers = posts
    .map((post) => Number(post?.post_number ?? 0))
    .filter((value) => Number.isFinite(value) && value > 1);

  if (visiblePostNumbers.length) {
    return Math.max(...visiblePostNumbers);
  }

  return 2;
}

function buildTopicPostUrl(topicUrl, postNumber = 2) {
  if (!topicUrl) {
    return "";
  }

  const normalizedTopicUrl = String(topicUrl).replace(/\/+$/, "");
  const normalizedPostNumber = Number(postNumber);

  if (!Number.isFinite(normalizedPostNumber) || normalizedPostNumber < 2) {
    return `${normalizedTopicUrl}/2`;
  }

  return `${normalizedTopicUrl}/${normalizedPostNumber}`;
}

function updateCommentCount(commentCount) {
  const fullElements = document.querySelectorAll(".js-comment-count-full");
  const numberElements = document.querySelectorAll(".js-comment-count-number");
  const labels = document.querySelectorAll(".js-comment-label");

  const fullLabel = commentCount === 1 ? "1 comentario" : `${commentCount} comentarios`;
  const numberLabel = String(commentCount);

  fullElements.forEach((element) => {
    if (commentCount > 0) {
      const textSpan = element.querySelector("span");
      if (textSpan) {
        textSpan.textContent = fullLabel;
      } else {
        element.textContent = fullLabel;
      }
      element.classList.remove("hidden");
    } else {
      element.classList.add("hidden");
    }
  });

  numberElements.forEach((element) => {
    if (commentCount > 0) {
      const mobile = element.querySelector(".js-comment-count-mobile");
      const desktop = element.querySelector(".js-comment-count-desktop");

      if (mobile && desktop) {
        mobile.textContent = numberLabel;
        desktop.textContent = fullLabel;
      } else {
        element.textContent = numberLabel;
      }
      element.classList.remove("hidden");
    } else {
      element.classList.add("hidden");
    }
  });

  labels.forEach((element) => {
    if (commentCount > 0) {
      element.classList.add("hidden");
    } else {
      element.classList.remove("hidden");
    }
  });
}

const DISCOURSE_DARK_COLOR_SCHEME_ID = 1;

function getDiscourseColorScheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function loadDiscourseEmbed(discourseUrl, topicId) {
  if (!discourseUrl || !topicId) {
    return;
  }

  const existingEmbedScript = document.querySelector('script[data-js-discourse-embed="true"]');
  const existingEmbedFrame =
    document.getElementById("discourse-embed-frame") ??
    document.querySelector('iframe[id^="discourse-embed"]');

  if (existingEmbedScript && existingEmbedFrame) {
    return;
  }

  if (existingEmbedScript && !existingEmbedFrame) {
    existingEmbedScript.remove();
  }

  const isDark = getDiscourseColorScheme() === "dark";

  window.DiscourseEmbed = {
    discourseUrl,
    topicId: Number(topicId),
    colorScheme: isDark ? "dark" : "light"
  };

  const embedScript = document.createElement("script");
  embedScript.src = `${discourseUrl}javascripts/embed.js`;
  embedScript.async = true;
  embedScript.dataset.jsDiscourseEmbed = "true";
  document.body.appendChild(embedScript);

  embedScript.addEventListener("load", () => {
    setTimeout(applyDiscourseColorSchemeToFrame, 1500);
  });
}

function applyDiscourseColorSchemeToFrame() {
  const embedFrame =
    document.getElementById("discourse-embed-frame") ??
    document.querySelector('iframe[id^="discourse-embed"]');

  if (!embedFrame || !embedFrame.src) {
    return;
  }

  try {
    const url = new URL(embedFrame.src);

    if (getDiscourseColorScheme() === "dark") {
      url.searchParams.set("color_scheme_id", String(DISCOURSE_DARK_COLOR_SCHEME_ID));
    } else {
      url.searchParams.delete("color_scheme_id");
    }

    embedFrame.src = url.toString();
  } catch {
    embedFrame.src = embedFrame.src;
  }
}

function refreshDiscourseEmbed() {
  applyDiscourseColorSchemeToFrame();
}

function setupCommentsEmbedVisibility(embedContainer, embedWrapper, emptyState) {
  if (!embedContainer || !embedWrapper) {
    return {
      disconnect() {},
      sync() {
        return false;
      }
    };
  }

  const toggleEmbedVisibility = () => {
    const hasIframe = Boolean(
      embedContainer.querySelector('iframe[id^="discourse-embed"], iframe#discourse-embed-frame')
    );

    embedWrapper.classList.toggle("hidden", !hasIframe);

    if (hasIframe) {
      emptyState?.classList.add("hidden");
    }

    return hasIframe;
  };

  toggleEmbedVisibility();

  const observer = new MutationObserver(() => {
    if (toggleEmbedVisibility()) {
      observer.disconnect();
    }
  });

  observer.observe(embedContainer, {
    childList: true,
    subtree: true
  });

  return {
    disconnect() {
      observer.disconnect();
    },
    sync: toggleEmbedVisibility
  };
}

export async function fetchTopicMetadata(topicJsonUrl, fallbackCount, fallbackLatestPostNumber = 2) {
  if (!topicJsonUrl) {
    return {
      commentCount: fallbackCount,
      latestPostNumber: fallbackLatestPostNumber
    };
  }

  try {
    const response = await fetch(topicJsonUrl, {
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        commentCount: fallbackCount,
        latestPostNumber: fallbackLatestPostNumber
      };
    }

    const topicPayload = await response.json();
    return {
      commentCount: normalizeCommentCount(topicPayload),
      latestPostNumber: normalizeLatestTopicPostNumber(topicPayload)
    };
  } catch {
    return {
      commentCount: fallbackCount,
      latestPostNumber: fallbackLatestPostNumber
    };
  }
}

export async function setupCommentsSection() {
  const commentsRoot = document.querySelector(".js-comments-root");

  if (!commentsRoot) {
    return;
  }

  const addCommentLink = commentsRoot.querySelector(".js-add-comment-link");
  const emptyState = commentsRoot.querySelector(".js-comments-empty-state");
  const embedContainer = commentsRoot.querySelector(".js-comments-embed");
  const embedWrapper = commentsRoot.querySelector(".js-comments-embed-wrapper");
  const discourseUrl = commentsRoot.dataset.discourseUrl;
  const topicId = commentsRoot.dataset.topicId;
  const topicUrl = commentsRoot.dataset.topicUrl;
  const topicJsonUrl = commentsRoot.dataset.topicJsonUrl;
  const initialReplies = Number(commentsRoot.dataset.initialReplies ?? 0);

  let commentCount = initialReplies;
  let latestPostNumber = 2;
  let hasLoadedEmbed = false;
  let embedVisibilityController = setupCommentsEmbedVisibility(embedContainer, embedWrapper, emptyState);

  function resetCommentsEmbed() {
    document.querySelector('script[data-js-discourse-embed="true"]')?.remove();
    document.getElementById("discourse-embed-frame")?.remove();
    document.querySelector('iframe[id^="discourse-embed"]')?.remove();

    if (embedContainer) {
      embedContainer.innerHTML = "";
    }

    embedWrapper?.classList.add("hidden");
    embedVisibilityController.disconnect();
    embedVisibilityController = setupCommentsEmbedVisibility(embedContainer, embedWrapper, emptyState);
    hasLoadedEmbed = false;
  }

  function renderCommentsSection(nextCommentCount, previousCommentCount = commentCount) {
    updateCommentCount(nextCommentCount);

    if (nextCommentCount > 0) {
      if (addCommentLink) {
        addCommentLink.href = buildTopicPostUrl(topicUrl, latestPostNumber);
      }

      addCommentLink?.classList.remove("hidden");
      emptyState?.classList.add("hidden");
      embedWrapper?.classList.remove("hidden");

      if (!hasLoadedEmbed) {
        loadDiscourseEmbed(discourseUrl, topicId);
        hasLoadedEmbed = true;
      } else if (nextCommentCount !== previousCommentCount) {
        refreshDiscourseEmbed();
      }

      embedVisibilityController.sync();
      return;
    }

    addCommentLink?.classList.add("hidden");
    embedWrapper?.classList.add("hidden");
    emptyState?.classList.remove("hidden");
  }

  async function syncCommentsSection() {
    const topicMetadata = await fetchTopicMetadata(topicJsonUrl, commentCount, latestPostNumber);
    const previousCommentCount = commentCount;

    commentCount = topicMetadata.commentCount;
    latestPostNumber = topicMetadata.latestPostNumber;
    renderCommentsSection(commentCount, previousCommentCount);
  }

  await syncCommentsSection();

  window.setInterval(() => {
    if (!document.hidden) {
      syncCommentsSection();
    }
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncCommentsSection();
    }
  });

  window.addEventListener("pageshow", () => {
    const embedFrame =
      document.getElementById("discourse-embed-frame") ??
      document.querySelector('iframe[id^="discourse-embed"]');

    if (commentCount > 0 && !embedFrame) {
      resetCommentsEmbed();
    }

    syncCommentsSection();
  });
}

document.addEventListener("discourse-theme-changed", applyDiscourseColorSchemeToFrame);
