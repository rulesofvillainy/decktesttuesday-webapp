package com.decktesttuesday.controller;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Vibrator;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String TAG = "DeckTestController";
    private static final String PREFS_NAME = "DeckTestPrefs";
    private static final String PREF_SECTION_ORDER = "section_order_v1";
    private static final String PREF_COLLAPSED_PREFIX = "collapsed_sec_";

    private static final String SEC_STREAM = "stream";
    private static final String SEC_CHAT = "chat";
    private static final String SEC_SETUP = "setup";
    private static final String SEC_ARENA = "arena";
    private static final String SEC_HISTORY = "history";
    private static final List<String> DEFAULT_SECTION_ORDER = Arrays.asList(
            SEC_STREAM, SEC_CHAT, SEC_SETUP, SEC_ARENA, SEC_HISTORY
    );

    // View Containers
    private ScrollView viewConnect;
    private ScrollView viewController;

    // Connect Screen Widgets
    private EditText etHost;
    private EditText etPort;
    private EditText etPassword;
    private Button btnConnect;
    private TextView tvConnectStatus;

    // Top Utility Widgets
    private Button btnToggleLive;
    private Button btnRefresh;
    private Button btnLayoutLock;
    private Button btnDisconnect;
    private LinearLayout llReorderHint;
    private Button btnResetLayout;
    private TextView tvToast;

    // Section Ordering & Collapse Management
    private LinearLayout llSectionsContainer;
    private final List<String> sectionOrder = new ArrayList<String>(DEFAULT_SECTION_ORDER);
    private final Map<String, View> sectionCardMap = new HashMap<String, View>();
    private final Map<String, View> sectionBodyMap = new HashMap<String, View>();
    private final Map<String, View> sectionDragControlsMap = new HashMap<String, View>();
    private final Map<String, TextView> sectionArrowMap = new HashMap<String, TextView>();
    private final Map<String, TextView> sectionSummaryMap = new HashMap<String, TextView>();
    private final Set<String> collapsedSections = new HashSet<String>();
    private boolean isLayoutUnlocked = false;

    // Stream Section Widgets
    private Spinner spEpisodes;
    private TextView tvStreamYtLabel;

    // YouTube Chat Section Widgets
    private TextView tvChatStatusPill;
    private Button btnChatRefresh;
    private TextView tvChatUrl;
    private Button btnChatLatest;
    private ScrollView svChatMessages;
    private TextView tvChatEmpty;
    private TextView tvChatMessages;
    private final Handler chatPollHandler = new Handler(Looper.getMainLooper());
    private long chatPollIntervalMs = 6000L;
    private boolean chatAutoScroll = true;
    private String currentChatUrl = "";
    private int lastChatMessageCount = 0;
    private boolean chatIsLiveActive = false;

    // Match Setup Widgets
    private Spinner spAndyDeck;
    private Spinner spKirstenDeck;
    private Button btnSwapDecks;
    private Button btnBo1;
    private Button btnBo3;
    private Button btnBo5;

    // Scoreboard Widgets
    private TextView tvSeriesStatus;
    private TextView tvAndyScore;
    private TextView tvKirstenScore;
    private TextView tvWinsNeeded;
    private TextView tvGameLog;

    // Win & Action Buttons
    private Button btnStartMatch;
    private LinearLayout llWinButtonsRow;
    private Button btnAndyWin;
    private Button btnKirstenWin;
    private LinearLayout llArenaActionsRow;
    private Button btnUndo;
    private Button btnReset;
    private Button btnSaveMatch;
    private boolean isMatchLive = false;

    // Match History Widgets
    private TextView tvMatchHistoryCount;
    private TextView tvMatchHistoryEmpty;
    private LinearLayout llMatchHistoryList;
    private final List<MatchRecord> currentStreamMatches = new ArrayList<MatchRecord>();

    // Infrastructure
    private SharedPreferences prefs;
    private Vibrator vibrator;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String sessionCookie = null;
    private String currentPassword = "villainy";

    // State
    private String baseUrl = "http://192.168.1.195:3001";
    private final List<Episode> episodeList = new ArrayList<Episode>();
    private final List<Deck> allDeckList = new ArrayList<Deck>();
    private final List<Deck> currentEpisodeDecks = new ArrayList<Deck>();

    private Episode selectedEpisode = null;
    private Deck selectedAndyDeck = null;
    private Deck selectedKirstenDeck = null;

    private String matchFormat = "Bo3";
    private int winsNeeded = 2;
    private final List<String> gameLog = new ArrayList<String>(); // "Andy" or "Kirsten"

    // -------------------------------------------------------------
    // Data Models
    // -------------------------------------------------------------
    public static class Deck {
        public String id;
        public String name;
        public String pilot;
        public String builtBy;
        public String inkOne;
        public String inkTwo;
        public String episodeId;
        public List<String> assignedEpisodes = new ArrayList<String>();

        @Override
        public String toString() {
            StringBuilder sb = new StringBuilder();
            sb.append(name != null && !name.isEmpty() ? name : "Untitled Deck");
            if (inkOne != null && inkTwo != null && !inkOne.isEmpty() && !inkTwo.isEmpty()) {
                sb.append(" (").append(inkOne).append("/").append(inkTwo).append(")");
            }
            return sb.toString();
        }
    }

    public static class Episode {
        public String id;
        public String title;
        public int episodeNumber;
        public String streamDate;
        public boolean isLive;
        public String youtubeVideoId;
        public String vodUrl;

        @Override
        public String toString() {
            if (streamDate != null && !streamDate.isEmpty()) {
                return "[" + streamDate + "] " + (title != null ? title : "Stream");
            }
            if (episodeNumber > 0) {
                return "Ep " + episodeNumber + ": " + title;
            }
            return title != null ? title : "Episode";
        }
    }

    public static class MatchRecord {
        public String id;
        public String episodeId;
        public String andyDeckId;
        public String kirstenDeckId;
        public String andyDeckName;
        public String kirstenDeckName;
        public String andyDeckInkOne;
        public String andyDeckInkTwo;
        public String kirstenDeckInkOne;
        public String kirstenDeckInkTwo;
        public String matchFormat;
        public int andyScore;
        public int kirstenScore;
        public String winner;
        public String createdAt;
    }

    // -------------------------------------------------------------
    // Lorcana Ink Helpers & Deck Adapter
    // -------------------------------------------------------------
    public static int getInkDrawableRes(String ink) {
        if (ink == null) return 0;
        String s = ink.trim().toLowerCase();
        if (s.equals("amber")) return R.drawable.ic_ink_amber;
        if (s.equals("amethyst")) return R.drawable.ic_ink_amethyst;
        if (s.equals("emerald")) return R.drawable.ic_ink_emerald;
        if (s.equals("ruby")) return R.drawable.ic_ink_ruby;
        if (s.equals("sapphire")) return R.drawable.ic_ink_sapphire;
        if (s.equals("steel")) return R.drawable.ic_ink_steel;
        return 0;
    }

    public static int getInkTextColor(String ink) {
        if (ink == null) return Color.parseColor("#9CA3AF");
        String s = ink.trim().toLowerCase();
        if (s.equals("amber")) return Color.parseColor("#FBBF24");
        if (s.equals("amethyst")) return Color.parseColor("#C084FC");
        if (s.equals("emerald")) return Color.parseColor("#4ADE80");
        if (s.equals("ruby")) return Color.parseColor("#F87171");
        if (s.equals("sapphire")) return Color.parseColor("#38BDF8");
        if (s.equals("steel")) return Color.parseColor("#CBD5E1");
        return Color.parseColor("#9CA3AF");
    }

    private static String formatInkName(String ink) {
        if (ink == null || ink.trim().isEmpty()) return "";
        String s = ink.trim();
        return s.substring(0, 1).toUpperCase() + s.substring(1).toLowerCase();
    }

    public static CharSequence buildColoredInkSpan(Deck deck) {
        if (deck == null) return "";
        SpannableStringBuilder sb = new SpannableStringBuilder();

        boolean hasInk1 = deck.inkOne != null && !deck.inkOne.trim().isEmpty();
        boolean hasInk2 = deck.inkTwo != null && !deck.inkTwo.trim().isEmpty();

        if (hasInk1) {
            String name1 = formatInkName(deck.inkOne);
            int start = sb.length();
            sb.append(name1);
            sb.setSpan(new ForegroundColorSpan(getInkTextColor(name1)), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            sb.setSpan(new StyleSpan(Typeface.BOLD), start, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

            if (hasInk2) {
                int slashStart = sb.length();
                sb.append(" / ");
                sb.setSpan(new ForegroundColorSpan(Color.parseColor("#6B7280")), slashStart, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

                String name2 = formatInkName(deck.inkTwo);
                int start2 = sb.length();
                sb.append(name2);
                sb.setSpan(new ForegroundColorSpan(getInkTextColor(name2)), start2, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sb.setSpan(new StyleSpan(Typeface.BOLD), start2, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
        }

        return sb;
    }

    public class DeckAdapter extends ArrayAdapter<Deck> {
        private final LayoutInflater inflater;

        public DeckAdapter(Context context, List<Deck> decks) {
            super(context, R.layout.deck_spinner_item, decks);
            this.inflater = LayoutInflater.from(context);
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View view = convertView;
            if (view == null) {
                view = inflater.inflate(R.layout.deck_spinner_item, parent, false);
            }
            Deck deck = getItem(position);
            bind(view, deck, false);
            return view;
        }

        @Override
        public View getDropDownView(int position, View convertView, ViewGroup parent) {
            View view = convertView;
            if (view == null) {
                view = inflater.inflate(R.layout.deck_spinner_dropdown_item, parent, false);
            }
            Deck deck = getItem(position);
            bind(view, deck, true);
            return view;
        }

        private void bind(View view, Deck deck, boolean isDropDown) {
            if (deck == null) return;
            ImageView iv1 = (ImageView) view.findViewById(isDropDown ? R.id.iv_dropdown_ink_one : R.id.iv_ink_one);
            ImageView iv2 = (ImageView) view.findViewById(isDropDown ? R.id.iv_dropdown_ink_two : R.id.iv_ink_two);
            TextView tvName = (TextView) view.findViewById(isDropDown ? R.id.tv_dropdown_deck_name : R.id.tv_deck_name);
            TextView tvSub = (TextView) view.findViewById(isDropDown ? R.id.tv_dropdown_deck_sub : R.id.tv_deck_sub);

            tvName.setText(deck.name != null && !deck.name.isEmpty() ? deck.name : "Untitled Deck");

            CharSequence subText = buildColoredInkSpan(deck);
            if (subText.length() > 0) {
                tvSub.setText(subText);
                tvSub.setVisibility(View.VISIBLE);
            } else {
                tvSub.setVisibility(View.GONE);
            }

            int res1 = getInkDrawableRes(deck.inkOne);
            if (res1 != 0) {
                iv1.setImageResource(res1);
                iv1.setVisibility(View.VISIBLE);
            } else {
                iv1.setVisibility(View.GONE);
            }

            int res2 = getInkDrawableRes(deck.inkTwo);
            if (res2 != 0) {
                iv2.setImageResource(res2);
                iv2.setVisibility(View.VISIBLE);
            } else {
                iv2.setVisibility(View.GONE);
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        CookieManager cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        CookieHandler.setDefault(cookieManager);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);

        initViews();
        loadSavedSettings();
        loadLayoutPrefs();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (viewController != null && viewController.getVisibility() == View.VISIBLE) {
            scheduleChatPollIfActive();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopChatPoll();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopChatPoll();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void initViews() {
        viewConnect = (ScrollView) findViewById(R.id.view_connect);
        viewController = (ScrollView) findViewById(R.id.view_controller);

        etHost = (EditText) findViewById(R.id.et_host);
        etPort = (EditText) findViewById(R.id.et_port);
        etPassword = (EditText) findViewById(R.id.et_password);
        btnConnect = (Button) findViewById(R.id.btn_connect);
        tvConnectStatus = (TextView) findViewById(R.id.tv_connect_status);

        btnToggleLive = (Button) findViewById(R.id.btn_toggle_live);
        btnRefresh = (Button) findViewById(R.id.btn_refresh);
        btnLayoutLock = (Button) findViewById(R.id.btn_layout_lock);
        btnDisconnect = (Button) findViewById(R.id.btn_disconnect);
        llReorderHint = (LinearLayout) findViewById(R.id.ll_reorder_hint);
        btnResetLayout = (Button) findViewById(R.id.btn_reset_layout);
        tvToast = (TextView) findViewById(R.id.tv_toast);

        llSectionsContainer = (LinearLayout) findViewById(R.id.ll_sections_container);

        // Stream widgets
        spEpisodes = (Spinner) findViewById(R.id.sp_episodes);
        tvStreamYtLabel = (TextView) findViewById(R.id.tv_stream_yt_label);

        // Chat widgets
        tvChatStatusPill = (TextView) findViewById(R.id.tv_chat_status_pill);
        btnChatRefresh = (Button) findViewById(R.id.btn_chat_refresh);
        tvChatUrl = (TextView) findViewById(R.id.tv_chat_url);
        btnChatLatest = (Button) findViewById(R.id.btn_chat_latest);
        svChatMessages = (ScrollView) findViewById(R.id.sv_chat_messages);
        tvChatEmpty = (TextView) findViewById(R.id.tv_chat_empty);
        tvChatMessages = (TextView) findViewById(R.id.tv_chat_messages);

        // Match setup widgets
        spAndyDeck = (Spinner) findViewById(R.id.sp_andy_deck);
        spKirstenDeck = (Spinner) findViewById(R.id.sp_kirsten_deck);
        btnSwapDecks = (Button) findViewById(R.id.btn_swap_decks);
        btnBo1 = (Button) findViewById(R.id.btn_bo1);
        btnBo3 = (Button) findViewById(R.id.btn_bo3);
        btnBo5 = (Button) findViewById(R.id.btn_bo5);

        // Arena widgets
        tvSeriesStatus = (TextView) findViewById(R.id.tv_series_status);
        tvAndyScore = (TextView) findViewById(R.id.tv_andy_score);
        tvKirstenScore = (TextView) findViewById(R.id.tv_kirsten_score);
        tvWinsNeeded = (TextView) findViewById(R.id.tv_wins_needed);
        tvGameLog = (TextView) findViewById(R.id.tv_game_log);

        btnStartMatch = (Button) findViewById(R.id.btn_start_match);
        llWinButtonsRow = (LinearLayout) findViewById(R.id.ll_win_buttons_row);
        btnAndyWin = (Button) findViewById(R.id.btn_andy_win);
        btnKirstenWin = (Button) findViewById(R.id.btn_kirsten_win);
        llArenaActionsRow = (LinearLayout) findViewById(R.id.ll_arena_actions_row);
        btnUndo = (Button) findViewById(R.id.btn_undo);
        btnReset = (Button) findViewById(R.id.btn_reset);
        btnSaveMatch = (Button) findViewById(R.id.btn_save_match);

        // Match history widgets
        tvMatchHistoryCount = (TextView) findViewById(R.id.tv_match_history_count);
        tvMatchHistoryEmpty = (TextView) findViewById(R.id.tv_match_history_empty);
        llMatchHistoryList = (LinearLayout) findViewById(R.id.ll_match_history_list);

        // Wire collapsible + reorderable sections
        registerSection(
                SEC_STREAM,
                R.id.sec_stream,
                R.id.ll_body_stream,
                R.id.ll_drag_stream,
                R.id.btn_drag_stream,
                R.id.btn_up_stream,
                R.id.btn_down_stream,
                R.id.btn_collapse_stream,
                R.id.tv_arrow_stream,
                R.id.tv_summary_stream
        );
        registerSection(
                SEC_CHAT,
                R.id.sec_chat,
                R.id.ll_body_chat,
                R.id.ll_drag_chat,
                R.id.btn_drag_chat,
                R.id.btn_up_chat,
                R.id.btn_down_chat,
                R.id.btn_collapse_chat,
                R.id.tv_arrow_chat,
                R.id.tv_summary_chat
        );
        registerSection(
                SEC_SETUP,
                R.id.sec_setup,
                R.id.ll_body_setup,
                R.id.ll_drag_setup,
                R.id.btn_drag_setup,
                R.id.btn_up_setup,
                R.id.btn_down_setup,
                R.id.btn_collapse_setup,
                R.id.tv_arrow_setup,
                R.id.tv_summary_setup
        );
        registerSection(
                SEC_ARENA,
                R.id.sec_arena,
                R.id.ll_body_arena,
                R.id.ll_drag_arena,
                R.id.btn_drag_arena,
                R.id.btn_up_arena,
                R.id.btn_down_arena,
                R.id.btn_collapse_arena,
                R.id.tv_arrow_arena,
                R.id.tv_summary_arena
        );
        registerSection(
                SEC_HISTORY,
                R.id.sec_history,
                R.id.ll_body_history,
                R.id.ll_drag_history,
                R.id.btn_drag_history,
                R.id.btn_up_history,
                R.id.btn_down_history,
                R.id.btn_collapse_history,
                R.id.tv_arrow_history,
                0
        );

        // Prevent outer ScrollView from stealing inner YouTube chat scrolling
        svChatMessages.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                int action = event.getActionMasked();
                if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_MOVE) {
                    if (v.getParent() != null) {
                        v.getParent().requestDisallowInterceptTouchEvent(true);
                    }
                } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                    if (v.getParent() != null) {
                        v.getParent().requestDisallowInterceptTouchEvent(false);
                    }
                }
                return false;
            }
        });

        svChatMessages.getViewTreeObserver().addOnScrollChangedListener(new ViewTreeObserver.OnScrollChangedListener() {
            @Override
            public void onScrollChanged() {
                if (svChatMessages.getChildCount() == 0) return;
                View child = svChatMessages.getChildAt(0);
                int diff = child.getBottom() - (svChatMessages.getHeight() + svChatMessages.getScrollY());
                boolean nearBottom = diff <= dp(18);
                if (chatAutoScroll != nearBottom) {
                    chatAutoScroll = nearBottom;
                    btnChatLatest.setVisibility(nearBottom || lastChatMessageCount == 0 ? View.GONE : View.VISIBLE);
                }
            }
        });

        btnChatLatest.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                chatAutoScroll = true;
                btnChatLatest.setVisibility(View.GONE);
                scrollChatToBottom();
            }
        });

        btnChatRefresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                vibrateFeedback(20);
                fetchYouTubeChat(true);
            }
        });

        tvChatUrl.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openUrlInBrowser(currentChatUrl);
            }
        });

        tvStreamYtLabel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openUrlInBrowser(currentChatUrl);
            }
        });

        // Layout Lock / Unlock button
        btnLayoutLock.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                vibrateFeedback(25);
                isLayoutUnlocked = !isLayoutUnlocked;
                applyLayoutLockUI();
            }
        });

        btnResetLayout.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                vibrateFeedback(25);
                sectionOrder.clear();
                sectionOrder.addAll(DEFAULT_SECTION_ORDER);
                applySectionOrderToContainer();
                saveLayoutPrefs();
                showToast("Reset section order to default.");
            }
        });

        // Connect button
        btnConnect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                doConnect();
            }
        });

        // Disconnect button
        btnDisconnect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showConnectScreen();
            }
        });

        // Refresh button
        btnRefresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                refreshData();
            }
        });

        // Toggle Live button
        btnToggleLive.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleLiveStatus();
            }
        });

        // Swap Decks button
        btnSwapDecks.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                swapDecks();
            }
        });

        // Format buttons
        btnBo1.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setFormat("Bo1", 1);
            }
        });
        btnBo3.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setFormat("Bo3", 2);
            }
        });
        btnBo5.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setFormat("Bo5", 3);
            }
        });

        // Start Match button
        btnStartMatch.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startMatch();
            }
        });

        // Win buttons
        btnAndyWin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                recordWin("Andy");
            }
        });

        btnKirstenWin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                recordWin("Kirsten");
            }
        });

        // Undo & Reset
        btnUndo.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                undoLastGame();
            }
        });

        btnReset.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                resetMatch();
            }
        });

        // Save Match
        btnSaveMatch.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveMatch();
            }
        });

        // Episode Spinner listener
        spEpisodes.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                if (position >= 0 && position < episodeList.size()) {
                    Episode chosen = episodeList.get(position);
                    if (selectedEpisode == null || !chosen.id.equals(selectedEpisode.id)) {
                        onEpisodeSelected(chosen);
                    }
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        // Deck Spinners listeners
        spAndyDeck.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                if (position >= 0 && position < currentEpisodeDecks.size()) {
                    selectedAndyDeck = currentEpisodeDecks.get(position);
                    updateScoreboardUI();
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        spKirstenDeck.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                if (position >= 0 && position < currentEpisodeDecks.size()) {
                    selectedKirstenDeck = currentEpisodeDecks.get(position);
                    updateScoreboardUI();
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });
    }

    private void registerSection(
            final String id,
            int cardResId,
            int bodyResId,
            int dragControlsResId,
            int dragHandleResId,
            int upBtnResId,
            int downBtnResId,
            int collapseHeaderResId,
            int arrowResId,
            int summaryResId
    ) {
        final View card = findViewById(cardResId);
        View body = findViewById(bodyResId);
        View dragControls = findViewById(dragControlsResId);
        View dragHandle = findViewById(dragHandleResId);
        Button btnUp = (Button) findViewById(upBtnResId);
        Button btnDown = (Button) findViewById(downBtnResId);
        View collapseBtn = findViewById(collapseHeaderResId);
        TextView tvArrow = (TextView) findViewById(arrowResId);
        TextView tvSummary = summaryResId != 0 ? (TextView) findViewById(summaryResId) : null;

        sectionCardMap.put(id, card);
        sectionBodyMap.put(id, body);
        sectionDragControlsMap.put(id, dragControls);
        sectionArrowMap.put(id, tvArrow);
        if (tvSummary != null) {
            sectionSummaryMap.put(id, tvSummary);
        }

        collapseBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleSectionCollapse(id);
            }
        });

        btnUp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                vibrateFeedback(15);
                moveSectionByDelta(id, -1);
            }
        });

        btnDown.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                vibrateFeedback(15);
                moveSectionByDelta(id, 1);
            }
        });

        dragHandle.setOnTouchListener(new View.OnTouchListener() {
            private float startRawY = 0f;
            private long lastSwapAt = 0L;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (!isLayoutUnlocked) return false;
                int action = event.getActionMasked();
                if (action == MotionEvent.ACTION_DOWN) {
                    if (llSectionsContainer.getParent() != null) {
                        llSectionsContainer.getParent().requestDisallowInterceptTouchEvent(true);
                    }
                    startRawY = event.getRawY();
                    lastSwapAt = 0L;
                    card.setAlpha(0.8f);
                    vibrateFeedback(20);
                    return true;
                } else if (action == MotionEvent.ACTION_MOVE) {
                    float dy = event.getRawY() - startRawY;
                    card.setTranslationY(dy);
                    long now = System.currentTimeMillis();
                    if (now - lastSwapAt > 130L) {
                        int idx = sectionOrder.indexOf(id);
                        int threshold = dp(34);
                        if (dy < -threshold && idx > 0) {
                            moveSectionByDelta(id, -1);
                            card.setTranslationY(0f);
                            startRawY = event.getRawY();
                            lastSwapAt = now;
                            vibrateFeedback(15);
                        } else if (dy > threshold && idx < sectionOrder.size() - 1) {
                            moveSectionByDelta(id, 1);
                            card.setTranslationY(0f);
                            startRawY = event.getRawY();
                            lastSwapAt = now;
                            vibrateFeedback(15);
                        }
                    }
                    return true;
                } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                    card.setTranslationY(0f);
                    card.setAlpha(1.0f);
                    if (llSectionsContainer.getParent() != null) {
                        llSectionsContainer.getParent().requestDisallowInterceptTouchEvent(false);
                    }
                    saveLayoutPrefs();
                    return true;
                }
                return false;
            }
        });
    }

    private void loadLayoutPrefs() {
        String savedOrder = prefs.getString(PREF_SECTION_ORDER, "");
        if (!savedOrder.isEmpty()) {
            List<String> loaded = new ArrayList<String>();
            String[] parts = savedOrder.split(",");
            for (String p : parts) {
                String trimmed = p.trim();
                if (DEFAULT_SECTION_ORDER.contains(trimmed) && !loaded.contains(trimmed)) {
                    loaded.add(trimmed);
                }
            }
            for (String defId : DEFAULT_SECTION_ORDER) {
                if (!loaded.contains(defId)) {
                    loaded.add(defId);
                }
            }
            sectionOrder.clear();
            sectionOrder.addAll(loaded);
        }

        collapsedSections.clear();
        for (String id : DEFAULT_SECTION_ORDER) {
            if (prefs.getBoolean(PREF_COLLAPSED_PREFIX + id, false)) {
                collapsedSections.add(id);
            }
        }

        applySectionOrderToContainer();
        applyCollapsedStatesUI();
        applyLayoutLockUI();
    }

    private void saveLayoutPrefs() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < sectionOrder.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(sectionOrder.get(i));
        }
        SharedPreferences.Editor ed = prefs.edit();
        ed.putString(PREF_SECTION_ORDER, sb.toString());
        for (String id : DEFAULT_SECTION_ORDER) {
            ed.putBoolean(PREF_COLLAPSED_PREFIX + id, collapsedSections.contains(id));
        }
        ed.apply();
    }

    private void applySectionOrderToContainer() {
        if (llSectionsContainer == null) return;
        llSectionsContainer.removeAllViews();
        for (String id : sectionOrder) {
            View v = sectionCardMap.get(id);
            if (v != null) {
                llSectionsContainer.addView(v);
            }
        }
    }

    private void moveSectionByDelta(String id, int delta) {
        int idx = sectionOrder.indexOf(id);
        int target = idx + delta;
        if (idx < 0 || target < 0 || target >= sectionOrder.size()) return;
        sectionOrder.remove(idx);
        sectionOrder.add(target, id);
        applySectionOrderToContainer();
        saveLayoutPrefs();
    }

    private void toggleSectionCollapse(String id) {
        if (collapsedSections.contains(id)) {
            collapsedSections.remove(id);
        } else {
            collapsedSections.add(id);
        }
        applyCollapsedStatesUI();
        saveLayoutPrefs();
        if (SEC_CHAT.equals(id)) {
            if (collapsedSections.contains(SEC_CHAT)) {
                stopChatPoll();
            } else {
                fetchYouTubeChat(true);
                scheduleChatPollIfActive();
            }
        }
    }

    private void applyCollapsedStatesUI() {
        for (String id : DEFAULT_SECTION_ORDER) {
            boolean isCollapsed = collapsedSections.contains(id);
            View body = sectionBodyMap.get(id);
            TextView arrow = sectionArrowMap.get(id);
            if (body != null) {
                body.setVisibility(isCollapsed ? View.GONE : View.VISIBLE);
            }
            if (arrow != null) {
                arrow.setText(isCollapsed ? "▶" : "▼");
            }
        }
        updateSectionSummariesUI();
    }

    private void applyLayoutLockUI() {
        btnLayoutLock.setText(isLayoutUnlocked ? "🔓 UNLOCKED" : "🔒 LOCKED");
        btnLayoutLock.setBackgroundResource(isLayoutUnlocked ? R.drawable.brutal_btn_pink : R.drawable.brutal_btn_purple);
        llReorderHint.setVisibility(isLayoutUnlocked ? View.VISIBLE : View.GONE);
        for (String id : DEFAULT_SECTION_ORDER) {
            View controls = sectionDragControlsMap.get(id);
            if (controls != null) {
                controls.setVisibility(isLayoutUnlocked ? View.VISIBLE : View.GONE);
            }
        }
    }

    private void updateSectionSummariesUI() {
        TextView sumStream = sectionSummaryMap.get(SEC_STREAM);
        if (sumStream != null) {
            if (selectedEpisode != null) {
                sumStream.setText((selectedEpisode.isLive ? "LIVE • " : "") + selectedEpisode.title);
            } else {
                sumStream.setText("");
            }
        }

        TextView sumChat = sectionSummaryMap.get(SEC_CHAT);
        if (sumChat != null) {
            if (chatIsLiveActive) {
                sumChat.setText(lastChatMessageCount + " msgs");
            } else if (selectedEpisode != null && selectedEpisode.youtubeVideoId != null && !selectedEpisode.youtubeVideoId.isEmpty()) {
                sumChat.setText(selectedEpisode.youtubeVideoId);
            } else {
                sumChat.setText("");
            }
        }

        TextView sumSetup = sectionSummaryMap.get(SEC_SETUP);
        if (sumSetup != null) {
            if (selectedAndyDeck != null && selectedKirstenDeck != null) {
                sumSetup.setText(selectedAndyDeck.name + " vs " + selectedKirstenDeck.name + " (" + matchFormat + ")");
            } else {
                sumSetup.setText(matchFormat);
            }
        }

        TextView sumArena = sectionSummaryMap.get(SEC_ARENA);
        if (sumArena != null) {
            sumArena.setText(getScore("Andy") + "-" + getScore("Kirsten") + " (" + matchFormat + ")");
        }
    }

    private void loadSavedSettings() {
        String savedHost = prefs.getString("host", "192.168.1.195");
        if ("127.0.0.1".equals(savedHost) || "localhost".equalsIgnoreCase(savedHost)) {
            savedHost = "192.168.1.195";
        }
        etHost.setText(savedHost);
        String portText = prefs.getString("port_text", null);
        if (portText == null) {
            int legacyPort = prefs.getInt("port", 3001);
            portText = String.valueOf(legacyPort);
        }
        etPort.setText(portText);
        etPassword.setText(prefs.getString("password", "villainy"));
    }

    private void saveSettings() {
        prefs.edit()
                .putString("host", etHost.getText().toString().trim())
                .putString("port_text", etPort.getText().toString().trim())
                .putString("password", etPassword.getText().toString().trim())
                .apply();
    }

    private void showConnectScreen() {
        stopChatPoll();
        viewController.setVisibility(View.GONE);
        viewConnect.setVisibility(View.VISIBLE);
        btnConnect.setEnabled(true);
        tvConnectStatus.setText("Ready to connect to web app.");
        tvConnectStatus.setTextColor(Color.parseColor("#FFB703"));
    }

    private void showControllerScreen() {
        viewConnect.setVisibility(View.GONE);
        viewController.setVisibility(View.VISIBLE);
        updateScoreboardUI();
        scheduleChatPollIfActive();
    }

    private void showToast(final String message) {
        tvToast.setText(message);
        tvToast.setVisibility(View.VISIBLE);
        mainHandler.removeCallbacksAndMessages(tvToast);
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                tvToast.setVisibility(View.GONE);
            }
        }, 3000);
    }

    private void vibrateFeedback(long ms) {
        if (vibrator != null) {
            try {
                vibrator.vibrate(ms);
            } catch (Exception ignored) {}
        }
    }

    private void openUrlInBrowser(String url) {
        if (url == null || url.trim().isEmpty()) return;
        String clean = url.trim();
        if (!clean.startsWith("http://") && !clean.startsWith("https://")) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(clean));
            startActivity(intent);
        } catch (Exception ignored) {}
    }

    // -------------------------------------------------------------
    // Connection & HTTP Networking
    // -------------------------------------------------------------
    private void doConnect() {
        String host = etHost.getText().toString().trim();
        String portStr = etPort.getText().toString().trim();
        final String password = etPassword.getText().toString().trim();

        if (host.isEmpty()) {
            Toast.makeText(this, "Please enter Host / URL", Toast.LENGTH_SHORT).show();
            return;
        }

        saveSettings();
        currentPassword = password;

        if (!host.startsWith("http://") && !host.startsWith("https://")) {
            host = "http://" + host;
        }
        while (host.endsWith("/")) {
            host = host.substring(0, host.length() - 1);
        }

        if (!portStr.isEmpty() && !host.matches(".+:\\d+$")) {
            baseUrl = host + ":" + portStr;
        } else {
            baseUrl = host;
        }

        btnConnect.setEnabled(false);
        tvConnectStatus.setText("Connecting to " + baseUrl + "...");
        tvConnectStatus.setTextColor(Color.parseColor("#FFB703"));

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    if (!password.isEmpty()) {
                        JSONObject authBody = new JSONObject();
                        authBody.put("password", password);
                        postJson(baseUrl + "/api/admin/auth", authBody.toString());
                    }

                    String episodesJson = getJson(baseUrl + "/api/episodes?includeHidden=true");
                    JSONObject epObj = new JSONObject(episodesJson);
                    JSONArray epArr = epObj.optJSONArray("episodes");
                    final List<Episode> fetchedEpisodes = parseEpisodesArray(epArr);

                    String decksJson = getJson(baseUrl + "/api/decks");
                    JSONObject deckObj = new JSONObject(decksJson);
                    JSONArray deckArr = deckObj.optJSONArray("decks");
                    final List<Deck> fetchedDecks = parseDecksArray(deckArr);

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            onConnectedSuccess(fetchedEpisodes, fetchedDecks);
                        }
                    });

                } catch (final Exception e) {
                    Log.e(TAG, "Connection failed: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            btnConnect.setEnabled(true);
                            tvConnectStatus.setText("Connection failed: " + e.getMessage());
                            tvConnectStatus.setTextColor(Color.parseColor("#FF4B91"));
                            Toast.makeText(MainActivity.this, "Error connecting to " + baseUrl, Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        });
    }

    private List<Episode> parseEpisodesArray(JSONArray epArr) {
        List<Episode> list = new ArrayList<Episode>();
        if (epArr == null) return list;
        for (int i = 0; i < epArr.length(); i++) {
            JSONObject o = epArr.optJSONObject(i);
            if (o == null) continue;
            Episode ep = new Episode();
            ep.id = o.optString("id");
            ep.title = o.optString("title", "Episode " + (i + 1));
            ep.episodeNumber = o.optInt("episode_number", 0);
            ep.streamDate = o.optString("stream_date", "");
            ep.isLive = o.optBoolean("is_live", false);
            ep.youtubeVideoId = o.isNull("youtube_video_id") ? "" : o.optString("youtube_video_id", "");
            ep.vodUrl = o.isNull("vod_url") ? "" : o.optString("vod_url", "");
            if (ep.vodUrl.isEmpty() && !ep.youtubeVideoId.isEmpty()) {
                ep.vodUrl = "https://www.youtube.com/watch?v=" + ep.youtubeVideoId;
            }
            list.add(ep);
        }
        return list;
    }

    private List<Deck> parseDecksArray(JSONArray deckArr) {
        List<Deck> list = new ArrayList<Deck>();
        if (deckArr == null) return list;
        for (int i = 0; i < deckArr.length(); i++) {
            JSONObject o = deckArr.optJSONObject(i);
            if (o == null) continue;
            Deck d = new Deck();
            d.id = o.optString("id");
            d.name = o.optString("deck_name", "Deck " + (i + 1));
            d.pilot = o.optString("pilot", "");
            d.builtBy = o.optString("built_by", "");
            d.inkOne = o.optString("ink_one", "");
            d.inkTwo = o.optString("ink_two", "");
            d.episodeId = o.optString("episode_id", "");

            JSONArray assigned = o.optJSONArray("assigned_episodes");
            if (assigned != null) {
                for (int j = 0; j < assigned.length(); j++) {
                    JSONObject asObj = assigned.optJSONObject(j);
                    if (asObj != null) {
                        d.assignedEpisodes.add(asObj.optString("episode_id"));
                    }
                }
            }
            list.add(d);
        }
        return list;
    }

    private void onConnectedSuccess(List<Episode> episodes, List<Deck> decks) {
        episodeList.clear();
        episodeList.addAll(episodes);

        allDeckList.clear();
        allDeckList.addAll(decks);

        ArrayAdapter<Episode> epAdapter = new ArrayAdapter<Episode>(
                this, R.layout.spinner_item, episodeList);
        epAdapter.setDropDownViewResource(R.layout.spinner_dropdown_item);
        spEpisodes.setAdapter(epAdapter);

        int selectedIndex = 0;
        for (int i = 0; i < episodeList.size(); i++) {
            if (episodeList.get(i).isLive) {
                selectedIndex = i;
                break;
            }
        }
        if (!episodeList.isEmpty()) {
            spEpisodes.setSelection(selectedIndex);
            onEpisodeSelected(episodeList.get(selectedIndex));
        }

        showControllerScreen();
        showToast("Connected to Deck Test Tuesday! ⚔️");
    }

    private void onEpisodeSelected(Episode ep) {
        selectedEpisode = ep;
        updateLiveButtonUI();
        updateStreamYouTubeHeaderUI();

        currentEpisodeDecks.clear();
        for (Deck d : allDeckList) {
            if (ep.id.equals(d.episodeId) || d.assignedEpisodes.contains(ep.id)) {
                currentEpisodeDecks.add(d);
            }
        }
        if (currentEpisodeDecks.isEmpty()) {
            currentEpisodeDecks.addAll(allDeckList);
        }

        DeckAdapter deckAdapter = new DeckAdapter(this, currentEpisodeDecks);
        spAndyDeck.setAdapter(deckAdapter);

        DeckAdapter deckAdapter2 = new DeckAdapter(this, currentEpisodeDecks);
        spKirstenDeck.setAdapter(deckAdapter2);

        int andyIdx = 0;
        int kirstenIdx = currentEpisodeDecks.size() > 1 ? 1 : 0;

        spAndyDeck.setSelection(andyIdx);
        spKirstenDeck.setSelection(kirstenIdx);

        if (!currentEpisodeDecks.isEmpty()) {
            selectedAndyDeck = currentEpisodeDecks.get(andyIdx);
            selectedKirstenDeck = currentEpisodeDecks.get(kirstenIdx);
        }

        updateScoreboardUI();
        fetchStreamMatches(ep.id);
        fetchLiveMatch(ep.id);

        // Reset chat display for new stream & load immediately if Chat is open
        lastChatMessageCount = 0;
        chatAutoScroll = true;
        btnChatLatest.setVisibility(View.GONE);
        tvChatMessages.setVisibility(View.GONE);
        tvChatEmpty.setVisibility(View.VISIBLE);
        tvChatEmpty.setText("Connecting to YouTube chat...");
        if (!collapsedSections.contains(SEC_CHAT)) {
            fetchYouTubeChat(true);
            scheduleChatPollIfActive();
        }
    }

    private void updateStreamYouTubeHeaderUI() {
        if (selectedEpisode == null) {
            tvStreamYtLabel.setVisibility(View.GONE);
            currentChatUrl = "";
            tvChatUrl.setText("Select a stream");
            return;
        }
        String url = selectedEpisode.vodUrl != null ? selectedEpisode.vodUrl.trim() : "";
        if (url.isEmpty() && selectedEpisode.youtubeVideoId != null && !selectedEpisode.youtubeVideoId.isEmpty()) {
            url = "https://www.youtube.com/watch?v=" + selectedEpisode.youtubeVideoId;
        }
        currentChatUrl = url;
        if (!url.isEmpty()) {
            tvStreamYtLabel.setText("YouTube: " + url);
            tvStreamYtLabel.setVisibility(View.VISIBLE);
            tvChatUrl.setText(url);
            tvChatUrl.setTextColor(Color.parseColor("#FF4B91"));
        } else {
            tvStreamYtLabel.setVisibility(View.GONE);
            tvChatUrl.setText("No YouTube URL linked to this stream");
            tvChatUrl.setTextColor(Color.parseColor("#9CA3AF"));
        }
        updateSectionSummariesUI();
    }

    private void refreshData() {
        vibrateFeedback(30);
        showToast("⟳ Refreshing stream, decks & chat...");

        final String prevEpisodeId = selectedEpisode != null ? selectedEpisode.id : null;
        final String prevAndyDeckId = selectedAndyDeck != null ? selectedAndyDeck.id : null;
        final String prevKirstenDeckId = selectedKirstenDeck != null ? selectedKirstenDeck.id : null;

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String episodesJson = getJson(baseUrl + "/api/episodes?includeHidden=true");
                    JSONObject epObj = new JSONObject(episodesJson);
                    final List<Episode> fetchedEpisodes = parseEpisodesArray(epObj.optJSONArray("episodes"));

                    String decksJson = getJson(baseUrl + "/api/decks");
                    JSONObject deckObj = new JSONObject(decksJson);
                    final List<Deck> fetchedDecks = parseDecksArray(deckObj.optJSONArray("decks"));

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            episodeList.clear();
                            episodeList.addAll(fetchedEpisodes);

                            allDeckList.clear();
                            allDeckList.addAll(fetchedDecks);

                            ArrayAdapter<Episode> epAdapter = new ArrayAdapter<Episode>(
                                    MainActivity.this, R.layout.spinner_item, episodeList);
                            epAdapter.setDropDownViewResource(R.layout.spinner_dropdown_item);
                            spEpisodes.setAdapter(epAdapter);

                            int epIdx = 0;
                            if (prevEpisodeId != null) {
                                for (int i = 0; i < episodeList.size(); i++) {
                                    if (prevEpisodeId.equals(episodeList.get(i).id)) {
                                        epIdx = i;
                                        break;
                                    }
                                }
                            }
                            if (!episodeList.isEmpty()) {
                                spEpisodes.setSelection(epIdx);
                                selectedEpisode = episodeList.get(epIdx);
                                updateLiveButtonUI();
                                updateStreamYouTubeHeaderUI();

                                currentEpisodeDecks.clear();
                                for (Deck d : allDeckList) {
                                    if (selectedEpisode.id.equals(d.episodeId) || d.assignedEpisodes.contains(selectedEpisode.id)) {
                                        currentEpisodeDecks.add(d);
                                    }
                                }
                                if (currentEpisodeDecks.isEmpty()) {
                                    currentEpisodeDecks.addAll(allDeckList);
                                }

                                DeckAdapter deckAdapter = new DeckAdapter(MainActivity.this, currentEpisodeDecks);
                                spAndyDeck.setAdapter(deckAdapter);

                                DeckAdapter deckAdapter2 = new DeckAdapter(MainActivity.this, currentEpisodeDecks);
                                spKirstenDeck.setAdapter(deckAdapter2);

                                int andyIdx = 0;
                                int kirstenIdx = currentEpisodeDecks.size() > 1 ? 1 : 0;

                                if (prevAndyDeckId != null) {
                                    for (int i = 0; i < currentEpisodeDecks.size(); i++) {
                                        if (prevAndyDeckId.equals(currentEpisodeDecks.get(i).id)) {
                                            andyIdx = i;
                                            break;
                                        }
                                    }
                                }
                                if (prevKirstenDeckId != null) {
                                    for (int i = 0; i < currentEpisodeDecks.size(); i++) {
                                        if (prevKirstenDeckId.equals(currentEpisodeDecks.get(i).id)) {
                                            kirstenIdx = i;
                                            break;
                                        }
                                    }
                                }

                                spAndyDeck.setSelection(andyIdx);
                                spKirstenDeck.setSelection(kirstenIdx);

                                if (!currentEpisodeDecks.isEmpty()) {
                                    selectedAndyDeck = currentEpisodeDecks.get(andyIdx);
                                    selectedKirstenDeck = currentEpisodeDecks.get(kirstenIdx);
                                }
                            }

                            updateScoreboardUI();
                            showToast("⟳ Refreshed!");
                            if (selectedEpisode != null) {
                                fetchStreamMatches(selectedEpisode.id);
                                fetchLiveMatch(selectedEpisode.id);
                                if (!collapsedSections.contains(SEC_CHAT)) {
                                    fetchYouTubeChat(true);
                                }
                            }
                        }
                    });

                } catch (final Exception e) {
                    Log.e(TAG, "Refresh failed: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, "Refresh failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                            showToast("Refresh error: " + e.getMessage());
                        }
                    });
                }
            }
        });
    }

    // -------------------------------------------------------------
    // YouTube Live Chat Reader (Polling only while section is open)
    // -------------------------------------------------------------
    private final Runnable chatPollRunnable = new Runnable() {
        @Override
        public void run() {
            if (viewController == null || viewController.getVisibility() != View.VISIBLE) {
                return;
            }
            if (collapsedSections.contains(SEC_CHAT) || selectedEpisode == null) {
                return;
            }
            fetchYouTubeChat(false);
            chatPollHandler.postDelayed(this, Math.max(chatPollIntervalMs, 5000L));
        }
    };

    private void stopChatPoll() {
        chatPollHandler.removeCallbacks(chatPollRunnable);
    }

    private void scheduleChatPollIfActive() {
        stopChatPoll();
        if (viewController != null
                && viewController.getVisibility() == View.VISIBLE
                && !collapsedSections.contains(SEC_CHAT)
                && selectedEpisode != null) {
            chatPollHandler.postDelayed(chatPollRunnable, Math.max(chatPollIntervalMs, 5000L));
        }
    }

    private void scrollChatToBottom() {
        svChatMessages.post(new Runnable() {
            @Override
            public void run() {
                svChatMessages.fullScroll(View.FOCUS_DOWN);
            }
        });
    }

    private void fetchYouTubeChat(final boolean forceRefresh) {
        if (selectedEpisode == null) return;
        final String epId = selectedEpisode.id;
        if (forceRefresh) {
            btnChatRefresh.setEnabled(false);
        }

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String url = baseUrl + "/api/admin/youtube-chat?episodeId=" + epId
                            + (forceRefresh ? "&refresh=1" : "");
                    String jsonStr = getJson(url);
                    final JSONObject obj = new JSONObject(jsonStr);

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            btnChatRefresh.setEnabled(true);
                            if (selectedEpisode == null || !epId.equals(selectedEpisode.id)) {
                                return;
                            }

                            chatIsLiveActive = obj.optBoolean("liveChatActive", false);
                            long serverInterval = obj.optLong("pollingIntervalMs", 6000L);
                            if (serverInterval >= 3000L) {
                                chatPollIntervalMs = serverInterval;
                            }

                            String serverUrl = obj.isNull("vodUrl") ? "" : obj.optString("vodUrl", "");
                            if (!serverUrl.isEmpty()) {
                                currentChatUrl = serverUrl;
                                tvChatUrl.setText(serverUrl);
                                tvChatUrl.setTextColor(Color.parseColor("#FF4B91"));
                            }

                            if (chatIsLiveActive) {
                                tvChatStatusPill.setText("LIVE");
                                tvChatStatusPill.setBackgroundResource(R.drawable.brutal_tag_teal);
                                tvChatStatusPill.setTextColor(Color.BLACK);
                            } else {
                                tvChatStatusPill.setText("IDLE");
                                tvChatStatusPill.setBackgroundResource(R.drawable.brutal_btn_dark);
                                tvChatStatusPill.setTextColor(Color.parseColor("#9CA3AF"));
                            }

                            JSONArray msgArr = obj.optJSONArray("messages");
                            String statusMsg = obj.isNull("statusMessage") ? "" : obj.optString("statusMessage", "");

                            if (msgArr == null || msgArr.length() == 0) {
                                lastChatMessageCount = 0;
                                tvChatMessages.setVisibility(View.GONE);
                                tvChatEmpty.setVisibility(View.VISIBLE);
                                tvChatEmpty.setText(statusMsg.isEmpty() ? "No chat messages yet." : statusMsg);
                                btnChatLatest.setVisibility(View.GONE);
                                updateSectionSummariesUI();
                                return;
                            }

                            SpannableStringBuilder ssb = new SpannableStringBuilder();
                            for (int i = 0; i < msgArr.length(); i++) {
                                JSONObject m = msgArr.optJSONObject(i);
                                if (m == null) continue;
                                if (ssb.length() > 0) ssb.append("\n");

                                String time = m.optString("timeLabel", "");
                                String badge = m.isNull("authorBadge") ? "" : m.optString("authorBadge", "");
                                String author = m.optString("authorName", "Viewer");
                                String text = m.optString("message", "");
                                String superAmt = m.isNull("superChatAmount") ? "" : m.optString("superChatAmount", "");

                                if (!time.isEmpty()) {
                                    int tStart = ssb.length();
                                    ssb.append(time).append(" ");
                                    ssb.setSpan(new ForegroundColorSpan(Color.parseColor("#6B7280")), tStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                                }

                                if (!badge.isEmpty()) {
                                    int bStart = ssb.length();
                                    ssb.append("[").append(badge).append("] ");
                                    int badgeColor = Color.parseColor("#00F5D4");
                                    if ("OWNER".equals(badge)) {
                                        badgeColor = Color.parseColor("#FFB703");
                                    } else if ("MEMBER".equals(badge)) {
                                        badgeColor = Color.parseColor("#4ADE80");
                                    }
                                    ssb.setSpan(new ForegroundColorSpan(badgeColor), bStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                                    ssb.setSpan(new StyleSpan(Typeface.BOLD), bStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                                }

                                int aStart = ssb.length();
                                ssb.append(author).append(": ");
                                int authorColor = "OWNER".equals(badge)
                                        ? Color.parseColor("#FFB703")
                                        : ("MOD".equals(badge) ? Color.parseColor("#00F5D4") : Color.parseColor("#C084FC"));
                                ssb.setSpan(new ForegroundColorSpan(authorColor), aStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                                ssb.setSpan(new StyleSpan(Typeface.BOLD), aStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

                                if (!superAmt.isEmpty()) {
                                    int scStart = ssb.length();
                                    ssb.append("[").append(superAmt).append("] ");
                                    ssb.setSpan(new BackgroundColorSpan(Color.parseColor("#452900")), scStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                                    ssb.setSpan(new ForegroundColorSpan(Color.parseColor("#FFB703")), scStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                                    ssb.setSpan(new StyleSpan(Typeface.BOLD), scStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                                }

                                int msgStart = ssb.length();
                                ssb.append(text);
                                ssb.setSpan(new ForegroundColorSpan(Color.parseColor("#F4F4F6")), msgStart, ssb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                            }

                            lastChatMessageCount = msgArr.length();
                            tvChatEmpty.setVisibility(View.GONE);
                            tvChatMessages.setVisibility(View.VISIBLE);
                            tvChatMessages.setText(ssb);
                            if (chatAutoScroll) {
                                scrollChatToBottom();
                            }
                            updateSectionSummariesUI();
                        }
                    });
                } catch (final Exception e) {
                    Log.w(TAG, "Chat fetch warning: " + e.getMessage());
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            btnChatRefresh.setEnabled(true);
                            tvChatStatusPill.setText("ERR");
                            if (lastChatMessageCount == 0) {
                                tvChatEmpty.setVisibility(View.VISIBLE);
                                tvChatMessages.setVisibility(View.GONE);
                                tvChatEmpty.setText("Chat unavailable: " + e.getMessage());
                            }
                        }
                    });
                }
            }
        });
    }

    private void updateLiveButtonUI() {
        if (selectedEpisode == null) return;
        if (selectedEpisode.isLive) {
            btnToggleLive.setText("● LIVE");
            btnToggleLive.setBackgroundResource(R.drawable.brutal_btn_pink);
            btnToggleLive.setTextColor(Color.parseColor("#FFFFFF"));
        } else {
            btnToggleLive.setText("● OFF-AIR");
            btnToggleLive.setBackgroundResource(R.drawable.brutal_btn_dark);
            btnToggleLive.setTextColor(Color.parseColor("#9CA3AF"));
        }
        updateSectionSummariesUI();
    }

    private void toggleLiveStatus() {
        if (selectedEpisode == null) return;
        final boolean newLive = !selectedEpisode.isLive;
        vibrateFeedback(40);

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("episodeId", selectedEpisode.id);
                    body.put("isLive", newLive);

                    patchJson(baseUrl + "/api/episodes", body.toString());

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            selectedEpisode.isLive = newLive;
                            updateLiveButtonUI();
                            showToast(newLive ? "Stream marked LIVE! 🔴" : "Stream set to OFF-AIR.");
                        }
                    });
                } catch (final Exception e) {
                    Log.e(TAG, "Failed to toggle live: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, "Live toggle failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        });
    }

    private void swapDecks() {
        vibrateFeedback(30);
        int andyPos = spAndyDeck.getSelectedItemPosition();
        int kirstenPos = spKirstenDeck.getSelectedItemPosition();

        spAndyDeck.setSelection(kirstenPos);
        spKirstenDeck.setSelection(andyPos);

        Deck temp = selectedAndyDeck;
        selectedAndyDeck = selectedKirstenDeck;
        selectedKirstenDeck = temp;

        updateScoreboardUI();
        showToast("⇄ Decks swapped!");
    }

    private void setFormat(String fmt, int needed) {
        vibrateFeedback(30);
        matchFormat = fmt;
        winsNeeded = needed;

        btnBo1.setBackgroundResource("Bo1".equals(fmt) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
        btnBo1.setTextColor(Color.parseColor("Bo1".equals(fmt) ? "#000000" : "#D1D5DB"));

        btnBo3.setBackgroundResource("Bo3".equals(fmt) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
        btnBo3.setTextColor(Color.parseColor("Bo3".equals(fmt) ? "#000000" : "#D1D5DB"));

        btnBo5.setBackgroundResource("Bo5".equals(fmt) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
        btnBo5.setTextColor(Color.parseColor("Bo5".equals(fmt) ? "#000000" : "#D1D5DB"));

        tvWinsNeeded.setText("FIRST TO " + winsNeeded);
        updateScoreboardUI();
    }

    private void startMatch() {
        if (selectedEpisode == null || selectedAndyDeck == null || selectedKirstenDeck == null) {
            Toast.makeText(this, "Select an active stream and both decks first", Toast.LENGTH_SHORT).show();
            return;
        }

        vibrateFeedback(50);
        isMatchLive = true;
        gameLog.clear();
        updateScoreboardUI();
        showToast("⚔️ Match started! 0-0 live on OBS.");
        sendLiveMatchUpdate();
    }

    private void sendLiveMatchUpdate() {
        if (selectedEpisode == null || selectedAndyDeck == null || selectedKirstenDeck == null) return;
        final int andyWins = getScore("Andy");
        final int kirstenWins = getScore("Kirsten");
        final String epId = selectedEpisode.id;
        final String aId = selectedAndyDeck.id;
        final String kId = selectedKirstenDeck.id;
        final String fmt = matchFormat;

        final JSONArray logArr = new JSONArray();
        for (int i = 0; i < gameLog.size(); i++) {
            try {
                JSONObject item = new JSONObject();
                item.put("game", i + 1);
                item.put("winner", gameLog.get(i));
                logArr.put(item);
            } catch (Exception ignored) {}
        }

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("episode_id", epId);
                    body.put("andy_deck_id", aId);
                    body.put("kirsten_deck_id", kId);
                    body.put("match_format", fmt);
                    body.put("andy_score", andyWins);
                    body.put("kirsten_score", kirstenWins);
                    body.put("game_log", logArr);

                    postJson(baseUrl + "/api/matches/live", body.toString());
                } catch (Exception e) {
                    Log.e(TAG, "Live match update failed: " + e.getMessage());
                }
            }
        });
    }

    private void fetchLiveMatch(final String epId) {
        if (epId == null || epId.isEmpty()) return;
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String res = getJson(baseUrl + "/api/matches/live?episodeId=" + epId);
                    JSONObject obj = new JSONObject(res);
                    if (!obj.has("liveMatch") || obj.isNull("liveMatch")) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                isMatchLive = false;
                                gameLog.clear();
                                updateScoreboardUI();
                            }
                        });
                        return;
                    }
                    JSONObject live = obj.getJSONObject("liveMatch");
                    final String aDeckId = live.optString("andy_deck_id");
                    final String kDeckId = live.optString("kirsten_deck_id");
                    final String fmt = live.optString("match_format", "Bo3");
                    final JSONArray logArr = live.optJSONArray("game_log");
                    final List<String> restoredLog = new ArrayList<String>();
                    if (logArr != null) {
                        for (int i = 0; i < logArr.length(); i++) {
                            JSONObject item = logArr.getJSONObject(i);
                            restoredLog.add(item.optString("winner"));
                        }
                    }

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            isMatchLive = true;
                            matchFormat = fmt;
                            winsNeeded = "Bo1".equals(fmt) ? 1 : ("Bo5".equals(fmt) ? 3 : 2);
                            gameLog.clear();
                            gameLog.addAll(restoredLog);

                            if (aDeckId != null && !aDeckId.isEmpty()) {
                                for (int i = 0; i < currentEpisodeDecks.size(); i++) {
                                    if (aDeckId.equals(currentEpisodeDecks.get(i).id)) {
                                        spAndyDeck.setSelection(i);
                                        selectedAndyDeck = currentEpisodeDecks.get(i);
                                        break;
                                    }
                                }
                            }

                            if (kDeckId != null && !kDeckId.isEmpty()) {
                                for (int i = 0; i < currentEpisodeDecks.size(); i++) {
                                    if (kDeckId.equals(currentEpisodeDecks.get(i).id)) {
                                        spKirstenDeck.setSelection(i);
                                        selectedKirstenDeck = currentEpisodeDecks.get(i);
                                        break;
                                    }
                                }
                            }

                            updateScoreboardUI();
                        }
                    });
                } catch (Exception e) {
                    Log.d(TAG, "No live match to resume: " + e.getMessage());
                }
            }
        });
    }

    private void recordWin(String winner) {
        if (!isMatchLive) {
            Toast.makeText(this, "Tap START MATCH first!", Toast.LENGTH_SHORT).show();
            return;
        }

        int andyWins = getScore("Andy");
        int kirstenWins = getScore("Kirsten");

        if (andyWins >= winsNeeded || kirstenWins >= winsNeeded) {
            return;
        }

        vibrateFeedback(60);
        gameLog.add(winner);
        updateScoreboardUI();
        sendLiveMatchUpdate();
    }

    private void undoLastGame() {
        if (!gameLog.isEmpty()) {
            vibrateFeedback(30);
            gameLog.remove(gameLog.size() - 1);
            updateScoreboardUI();
            showToast("Undid last game result.");
            if (isMatchLive) {
                sendLiveMatchUpdate();
            }
        }
    }

    private void resetMatch() {
        vibrateFeedback(40);
        if (isMatchLive && selectedEpisode != null) {
            final String epId = selectedEpisode.id;
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        deleteHttp(baseUrl + "/api/matches/live?episodeId=" + epId);
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to clear live match: " + e.getMessage());
                    }
                }
            });
        }
        isMatchLive = false;
        gameLog.clear();
        updateScoreboardUI();
        showToast("Match cancelled & cleared from OBS overlay.");
    }

    private int getScore(String pilot) {
        int c = 0;
        for (String w : gameLog) {
            if (pilot.equalsIgnoreCase(w)) c++;
        }
        return c;
    }

    private void updateScoreboardUI() {
        int andyWins = getScore("Andy");
        int kirstenWins = getScore("Kirsten");
        int currentGame = gameLog.size() + 1;

        tvAndyScore.setText(String.valueOf(andyWins));
        tvKirstenScore.setText(String.valueOf(kirstenWins));
        tvWinsNeeded.setText("FIRST TO " + winsNeeded);

        // Update format buttons highlight even after resume
        btnBo1.setBackgroundResource("Bo1".equals(matchFormat) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
        btnBo1.setTextColor(Color.parseColor("Bo1".equals(matchFormat) ? "#000000" : "#D1D5DB"));
        btnBo3.setBackgroundResource("Bo3".equals(matchFormat) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
        btnBo3.setTextColor(Color.parseColor("Bo3".equals(matchFormat) ? "#000000" : "#D1D5DB"));
        btnBo5.setBackgroundResource("Bo5".equals(matchFormat) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
        btnBo5.setTextColor(Color.parseColor("Bo5".equals(matchFormat) ? "#000000" : "#D1D5DB"));

        // Lock deck pickers and format while match is live
        spAndyDeck.setEnabled(!isMatchLive);
        spKirstenDeck.setEnabled(!isMatchLive);
        btnSwapDecks.setEnabled(!isMatchLive);
        btnSwapDecks.setAlpha(!isMatchLive ? 1.0f : 0.4f);
        btnBo1.setEnabled(!isMatchLive);
        btnBo3.setEnabled(!isMatchLive);
        btnBo5.setEnabled(!isMatchLive);

        updateSectionSummariesUI();

        boolean clinched = (andyWins >= winsNeeded || kirstenWins >= winsNeeded);
        String clincher = andyWins >= winsNeeded ? "Andy" : (kirstenWins >= winsNeeded ? "Kirsten" : null);

        if (!isMatchLive) {
            tvSeriesStatus.setText("Ready • " + matchFormat);
            tvSeriesStatus.setBackgroundResource(R.drawable.brutal_tag_teal);
            tvSeriesStatus.setTextColor(Color.parseColor("#000000"));

            btnStartMatch.setVisibility(View.VISIBLE);
            llWinButtonsRow.setVisibility(View.GONE);
            llArenaActionsRow.setVisibility(View.GONE);
            btnSaveMatch.setVisibility(View.GONE);
            tvGameLog.setVisibility(View.GONE);
            return;
        }

        // When match IS live:
        btnStartMatch.setVisibility(View.GONE);
        llWinButtonsRow.setVisibility(View.VISIBLE);
        llArenaActionsRow.setVisibility(View.VISIBLE);
        btnReset.setText("CANCEL");
        btnSaveMatch.setVisibility(View.VISIBLE);

        if (clinched) {
            tvSeriesStatus.setText(clincher.toUpperCase() + " CLINCHED (" + andyWins + "-" + kirstenWins + ")");
            tvSeriesStatus.setBackgroundResource(R.drawable.brutal_btn_amber);
            tvSeriesStatus.setTextColor(Color.parseColor("#000000"));
        } else {
            tvSeriesStatus.setBackgroundResource(R.drawable.brutal_tag_teal);
            tvSeriesStatus.setTextColor(Color.parseColor("#000000"));

            if (andyWins == 0 && kirstenWins == 0) {
                tvSeriesStatus.setText("G1 • 0-0 (" + matchFormat + ")");
            } else if (andyWins == kirstenWins) {
                tvSeriesStatus.setText("G" + currentGame + " • Tied " + andyWins + "-" + kirstenWins);
            } else {
                String leader = andyWins > kirstenWins ? "Andy" : "Kirsten";
                int high = Math.max(andyWins, kirstenWins);
                int low = Math.min(andyWins, kirstenWins);
                tvSeriesStatus.setText("G" + currentGame + " • " + leader + " " + high + "-" + low);
            }
        }

        String andyDeckName = selectedAndyDeck != null ? selectedAndyDeck.name : "Andy";
        String kirstenDeckName = selectedKirstenDeck != null ? selectedKirstenDeck.name : "Kirsten";

        if (clinched) {
            btnAndyWin.setEnabled(false);
            btnAndyWin.setAlpha(0.35f);
            btnAndyWin.setText("ANDY (" + andyWins + "W)\n" + andyDeckName);

            btnKirstenWin.setEnabled(false);
            btnKirstenWin.setAlpha(0.35f);
            btnKirstenWin.setText("KIRSTEN (" + kirstenWins + "W)\n" + kirstenDeckName);
        } else {
            btnAndyWin.setEnabled(true);
            btnAndyWin.setAlpha(1.0f);
            btnAndyWin.setText("ANDY WON G" + currentGame + "\n" + andyDeckName);

            btnKirstenWin.setEnabled(true);
            btnKirstenWin.setAlpha(1.0f);
            btnKirstenWin.setText("KIRSTEN WON G" + currentGame + "\n" + kirstenDeckName);
        }

        boolean hasGames = !gameLog.isEmpty();
        btnUndo.setEnabled(hasGames);
        btnUndo.setAlpha(hasGames ? 1.0f : 0.4f);

        btnReset.setEnabled(true);
        btnReset.setAlpha(1.0f);

        btnSaveMatch.setEnabled(hasGames);
        btnSaveMatch.setAlpha(hasGames ? 1.0f : 0.4f);

        if (hasGames) {
            StringBuilder logText = new StringBuilder();
            for (int i = 0; i < gameLog.size(); i++) {
                if (i > 0) logText.append(" • ");
                logText.append("G").append(i + 1).append(": ").append(gameLog.get(i));
            }
            tvGameLog.setText(logText.toString());
            tvGameLog.setVisibility(View.VISIBLE);
        } else {
            tvGameLog.setVisibility(View.GONE);
        }
    }

    private void saveMatch() {
        if (selectedEpisode == null || selectedAndyDeck == null || selectedKirstenDeck == null) {
            Toast.makeText(this, "Select an episode and both decks first", Toast.LENGTH_SHORT).show();
            return;
        }

        final int andyWins = getScore("Andy");
        final int kirstenWins = getScore("Kirsten");
        if (andyWins == 0 && kirstenWins == 0) {
            Toast.makeText(this, "Record at least 1 game before saving", Toast.LENGTH_SHORT).show();
            return;
        }

        vibrateFeedback(80);
        btnSaveMatch.setEnabled(false);
        showToast("Saving match...");

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("episode_id", selectedEpisode.id);
                    body.put("andy_deck_id", selectedAndyDeck.id);
                    body.put("kirsten_deck_id", selectedKirstenDeck.id);
                    body.put("match_format", matchFormat);
                    body.put("andy_score", andyWins);
                    body.put("kirsten_score", kirstenWins);

                    String winner = andyWins > kirstenWins ? "Andy" : (kirstenWins > andyWins ? "Kirsten" : "Draw");
                    body.put("winner", winner);

                    JSONArray logArr = new JSONArray();
                    for (int i = 0; i < gameLog.size(); i++) {
                        JSONObject item = new JSONObject();
                        item.put("game", i + 1);
                        item.put("winner", gameLog.get(i));
                        logArr.put(item);
                    }
                    body.put("game_log", logArr);

                    postJson(baseUrl + "/api/matches", body.toString());

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            gameLog.clear();
                            isMatchLive = false;
                            updateScoreboardUI();
                            showToast("🏆 Match saved!");
                            Toast.makeText(MainActivity.this, "Match saved!", Toast.LENGTH_SHORT).show();
                            if (selectedEpisode != null) {
                                fetchStreamMatches(selectedEpisode.id);
                                fetchLiveMatch(selectedEpisode.id);
                            }
                        }
                    });

                } catch (final Exception e) {
                    Log.e(TAG, "Save match failed: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            btnSaveMatch.setEnabled(true);
                            btnSaveMatch.setAlpha(1.0f);
                            Toast.makeText(MainActivity.this, "Save failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
                            showToast("Error saving match: " + e.getMessage());
                        }
                    });
                }
            }
        });
    }

    // -------------------------------------------------------------
    // HTTP Utilities
    // -------------------------------------------------------------
    private void applyHeaders(HttpURLConnection conn) {
        conn.setRequestProperty("Accept", "application/json");
        if (sessionCookie != null) {
            conn.setRequestProperty("Cookie", sessionCookie);
        }
        if (currentPassword != null && !currentPassword.isEmpty()) {
            conn.setRequestProperty("x-admin-password", currentPassword);
            conn.setRequestProperty("x-admin-key", currentPassword);
            conn.setRequestProperty("Authorization", "Bearer " + currentPassword);
        }
    }

    private String getJson(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        applyHeaders(conn);

        int code = conn.getResponseCode();
        captureCookies(conn);

        if (code >= 200 && code < 300) {
            return readStream(conn.getInputStream());
        } else {
            String err = readStream(conn.getErrorStream());
            throw new Exception("HTTP " + code + ": " + err);
        }
    }

    private String postJson(String urlStr, String jsonBody) throws Exception {
        return sendWithBody("POST", urlStr, jsonBody);
    }

    private String patchJson(String urlStr, String jsonBody) throws Exception {
        return sendWithBody("PATCH", urlStr, jsonBody);
    }

    private String sendWithBody(String method, String urlStr, String jsonBody) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        applyHeaders(conn);

        byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
        OutputStream os = conn.getOutputStream();
        os.write(bytes);
        os.flush();
        os.close();

        int code = conn.getResponseCode();
        captureCookies(conn);

        if (code >= 200 && code < 300) {
            return readStream(conn.getInputStream());
        } else {
            String err = readStream(conn.getErrorStream());
            throw new Exception("HTTP " + code + ": " + err);
        }
    }

    private String deleteHttp(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("DELETE");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        applyHeaders(conn);

        int code = conn.getResponseCode();
        captureCookies(conn);

        if (code >= 200 && code < 300) {
            return readStream(conn.getInputStream());
        } else {
            String err = readStream(conn.getErrorStream());
            throw new Exception("HTTP " + code + ": " + err);
        }
    }

    // -------------------------------------------------------------
    // Match History & Retroactive Editing
    // -------------------------------------------------------------
    private Deck findDeck(String deckId) {
        if (deckId == null) return null;
        for (Deck d : allDeckList) {
            if (deckId.equals(d.id)) return d;
        }
        for (Deck d : currentEpisodeDecks) {
            if (deckId.equals(d.id)) return d;
        }
        return null;
    }

    private String resolveDeckName(String deckId) {
        Deck d = findDeck(deckId);
        if (d != null && d.name != null && !d.name.isEmpty()) {
            return d.name;
        }
        return "Deck";
    }

    private void fetchStreamMatches(final String epId) {
        if (epId == null || epId.isEmpty()) return;
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String res = getJson(baseUrl + "/api/matches?episodeId=" + epId);
                    JSONObject obj = new JSONObject(res);
                    JSONArray arr = obj.optJSONArray("matches");
                    final List<MatchRecord> list = new ArrayList<MatchRecord>();
                    if (arr != null) {
                        for (int i = 0; i < arr.length(); i++) {
                            JSONObject m = arr.getJSONObject(i);
                            MatchRecord r = new MatchRecord();
                            r.id = m.optString("id");
                            r.episodeId = m.optString("episode_id");
                            r.andyDeckId = m.optString("andy_deck_id");
                            r.kirstenDeckId = m.optString("kirsten_deck_id");
                            r.matchFormat = m.optString("match_format", "Bo3");
                            r.andyScore = m.optInt("andy_score", 0);
                            r.kirstenScore = m.optInt("kirsten_score", 0);
                            r.winner = m.optString("winner", "");
                            r.createdAt = m.optString("created_at", "");

                            r.andyDeckName = resolveDeckName(r.andyDeckId);
                            r.kirstenDeckName = resolveDeckName(r.kirstenDeckId);

                            Deck aDeck = findDeck(r.andyDeckId);
                            if (aDeck != null) {
                                r.andyDeckInkOne = aDeck.inkOne;
                                r.andyDeckInkTwo = aDeck.inkTwo;
                            }
                            Deck kDeck = findDeck(r.kirstenDeckId);
                            if (kDeck != null) {
                                r.kirstenDeckInkOne = kDeck.inkOne;
                                r.kirstenDeckInkTwo = kDeck.inkTwo;
                            }

                            list.add(r);
                        }
                    }

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            currentStreamMatches.clear();
                            currentStreamMatches.addAll(list);
                            renderMatchHistoryUI();
                        }
                    });
                } catch (final Exception e) {
                    Log.e(TAG, "Failed to fetch stream matches: " + e.getMessage(), e);
                }
            }
        });
    }

    private void renderMatchHistoryUI() {
        if (llMatchHistoryList == null || tvMatchHistoryCount == null || tvMatchHistoryEmpty == null) return;

        tvMatchHistoryCount.setText(String.valueOf(currentStreamMatches.size()));

        if (currentStreamMatches.isEmpty()) {
            tvMatchHistoryEmpty.setVisibility(View.VISIBLE);
            llMatchHistoryList.removeAllViews();
            return;
        }

        tvMatchHistoryEmpty.setVisibility(View.GONE);
        llMatchHistoryList.removeAllViews();
        LayoutInflater inflater = LayoutInflater.from(this);

        for (int i = currentStreamMatches.size() - 1; i >= 0; i--) {
            final MatchRecord m = currentStreamMatches.get(i);
            final int matchNumber = i + 1;

            View v = inflater.inflate(R.layout.item_match_history, llMatchHistoryList, false);

            TextView tvMatchNum = (TextView) v.findViewById(R.id.tv_item_match_number);
            TextView tvWinnerBadge = (TextView) v.findViewById(R.id.tv_item_winner_badge);
            TextView tvAndyDeck = (TextView) v.findViewById(R.id.tv_item_andy_deck);
            TextView tvAndyScore = (TextView) v.findViewById(R.id.tv_item_andy_score);
            TextView tvKirstenDeck = (TextView) v.findViewById(R.id.tv_item_kirsten_deck);
            TextView tvKirstenScore = (TextView) v.findViewById(R.id.tv_item_kirsten_score);
            Button btnEdit = (Button) v.findViewById(R.id.btn_item_edit);
            Button btnDelete = (Button) v.findViewById(R.id.btn_item_delete);

            tvMatchNum.setText("M" + matchNumber + " • " + m.matchFormat);

            String winner = m.winner;
            if ("Andy".equalsIgnoreCase(winner)) {
                tvWinnerBadge.setText("ANDY");
                tvWinnerBadge.setBackgroundResource(R.drawable.brutal_btn_purple);
                tvWinnerBadge.setTextColor(Color.WHITE);
            } else if ("Kirsten".equalsIgnoreCase(winner)) {
                tvWinnerBadge.setText("KIRSTEN");
                tvWinnerBadge.setBackgroundResource(R.drawable.brutal_btn_pink);
                tvWinnerBadge.setTextColor(Color.WHITE);
            } else {
                tvWinnerBadge.setText("DRAW");
                tvWinnerBadge.setBackgroundResource(R.drawable.brutal_tag_teal);
                tvWinnerBadge.setTextColor(Color.BLACK);
            }

            Deck aDeck = findDeck(m.andyDeckId);
            if (aDeck != null && aDeck.name != null) {
                tvAndyDeck.setText(aDeck.name);
            } else {
                tvAndyDeck.setText(m.andyDeckName);
            }

            Deck kDeck = findDeck(m.kirstenDeckId);
            if (kDeck != null && kDeck.name != null) {
                tvKirstenDeck.setText(kDeck.name);
            } else {
                tvKirstenDeck.setText(m.kirstenDeckName);
            }

            tvAndyScore.setText(String.valueOf(m.andyScore));
            tvKirstenScore.setText(String.valueOf(m.kirstenScore));

            btnEdit.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    vibrateFeedback(30);
                    showEditMatchDialog(m, matchNumber);
                }
            });

            btnDelete.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    vibrateFeedback(40);
                    showDeleteMatchConfirmDialog(m, matchNumber);
                }
            });

            llMatchHistoryList.addView(v);
        }
    }

    private void showEditMatchDialog(final MatchRecord m, final int matchNumber) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        LayoutInflater inflater = LayoutInflater.from(this);
        View dialogView = inflater.inflate(R.layout.dialog_edit_match, null);
        builder.setView(dialogView);

        final AlertDialog dialog = builder.create();

        TextView tvTitle = (TextView) dialogView.findViewById(R.id.tv_dialog_title);
        final Spinner spAndy = (Spinner) dialogView.findViewById(R.id.sp_edit_andy_deck);
        final Spinner spKirsten = (Spinner) dialogView.findViewById(R.id.sp_edit_kirsten_deck);

        Button btnAndyMinus = (Button) dialogView.findViewById(R.id.btn_edit_andy_minus);
        Button btnAndyPlus = (Button) dialogView.findViewById(R.id.btn_edit_andy_plus);
        final TextView tvAndyScore = (TextView) dialogView.findViewById(R.id.tv_edit_andy_score);

        Button btnKirstenMinus = (Button) dialogView.findViewById(R.id.btn_edit_kirsten_minus);
        Button btnKirstenPlus = (Button) dialogView.findViewById(R.id.btn_edit_kirsten_plus);
        final TextView tvKirstenScore = (TextView) dialogView.findViewById(R.id.tv_edit_kirsten_score);

        final Button btnBo1 = (Button) dialogView.findViewById(R.id.btn_edit_bo1);
        final Button btnBo3 = (Button) dialogView.findViewById(R.id.btn_edit_bo3);
        final Button btnBo5 = (Button) dialogView.findViewById(R.id.btn_edit_bo5);

        Button btnDelete = (Button) dialogView.findViewById(R.id.btn_edit_delete);
        Button btnCancel = (Button) dialogView.findViewById(R.id.btn_edit_cancel);
        Button btnSave = (Button) dialogView.findViewById(R.id.btn_edit_save);

        tvTitle.setText("✏️ EDIT MATCH " + matchNumber);

        DeckAdapter deckAdapterA = new DeckAdapter(this, currentEpisodeDecks);
        spAndy.setAdapter(deckAdapterA);
        DeckAdapter deckAdapterK = new DeckAdapter(this, currentEpisodeDecks);
        spKirsten.setAdapter(deckAdapterK);

        int selA = 0;
        int selK = 0;
        for (int i = 0; i < currentEpisodeDecks.size(); i++) {
            Deck d = currentEpisodeDecks.get(i);
            if (d.id != null && d.id.equals(m.andyDeckId)) selA = i;
            if (d.id != null && d.id.equals(m.kirstenDeckId)) selK = i;
        }
        spAndy.setSelection(selA);
        spKirsten.setSelection(selK);

        final int[] scores = new int[]{m.andyScore, m.kirstenScore};
        final String[] editFormat = new String[]{m.matchFormat != null ? m.matchFormat : "Bo3"};

        tvAndyScore.setText(String.valueOf(scores[0]));
        tvKirstenScore.setText(String.valueOf(scores[1]));

        btnAndyMinus.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (scores[0] > 0) {
                    scores[0]--;
                    tvAndyScore.setText(String.valueOf(scores[0]));
                }
            }
        });
        btnAndyPlus.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                scores[0]++;
                tvAndyScore.setText(String.valueOf(scores[0]));
            }
        });

        btnKirstenMinus.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (scores[1] > 0) {
                    scores[1]--;
                    tvKirstenScore.setText(String.valueOf(scores[1]));
                }
            }
        });
        btnKirstenPlus.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                scores[1]++;
                tvKirstenScore.setText(String.valueOf(scores[1]));
            }
        });

        final Runnable updateFormatButtons = new Runnable() {
            @Override
            public void run() {
                btnBo1.setBackgroundResource("Bo1".equals(editFormat[0]) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
                btnBo1.setTextColor("Bo1".equals(editFormat[0]) ? Color.BLACK : Color.parseColor("#D1D5DB"));

                btnBo3.setBackgroundResource("Bo3".equals(editFormat[0]) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
                btnBo3.setTextColor("Bo3".equals(editFormat[0]) ? Color.BLACK : Color.parseColor("#D1D5DB"));

                btnBo5.setBackgroundResource("Bo5".equals(editFormat[0]) ? R.drawable.brutal_btn_amber : R.drawable.brutal_btn_dark);
                btnBo5.setTextColor("Bo5".equals(editFormat[0]) ? Color.BLACK : Color.parseColor("#D1D5DB"));
            }
        };
        updateFormatButtons.run();

        btnBo1.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editFormat[0] = "Bo1";
                updateFormatButtons.run();
            }
        });
        btnBo3.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editFormat[0] = "Bo3";
                updateFormatButtons.run();
            }
        });
        btnBo5.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editFormat[0] = "Bo5";
                updateFormatButtons.run();
            }
        });

        btnCancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
            }
        });

        btnDelete.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
                showDeleteMatchConfirmDialog(m, matchNumber);
            }
        });

        btnSave.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                vibrateFeedback(30);
                Deck aDeck = (Deck) spAndy.getSelectedItem();
                Deck kDeck = (Deck) spKirsten.getSelectedItem();

                if (aDeck == null || kDeck == null) {
                    Toast.makeText(MainActivity.this, "Please select both decks", Toast.LENGTH_SHORT).show();
                    return;
                }

                final String newAndyDeckId = aDeck.id;
                final String newKirstenDeckId = kDeck.id;
                final int newAndyScore = scores[0];
                final int newKirstenScore = scores[1];
                final String newFormat = editFormat[0];

                dialog.dismiss();
                saveMatchEdit(m.id, newAndyDeckId, newKirstenDeckId, newFormat, newAndyScore, newKirstenScore);
            }
        });

        dialog.show();
    }

    private void saveMatchEdit(final String matchId, final String andyDeckId, final String kirstenDeckId, final String format, final int andyScore, final int kirstenScore) {
        showToast("Saving match update...");
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("id", matchId);
                    body.put("andy_deck_id", andyDeckId);
                    body.put("kirsten_deck_id", kirstenDeckId);
                    body.put("match_format", format);
                    body.put("andy_score", andyScore);
                    body.put("kirsten_score", kirstenScore);
                    String winner = andyScore > kirstenScore ? "Andy" : (kirstenScore > andyScore ? "Kirsten" : "Draw");
                    body.put("winner", winner);

                    patchJson(baseUrl + "/api/matches", body.toString());

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            showToast("Match updated!");
                            Toast.makeText(MainActivity.this, "Match updated!", Toast.LENGTH_SHORT).show();
                            if (selectedEpisode != null) {
                                fetchStreamMatches(selectedEpisode.id);
                                fetchLiveMatch(selectedEpisode.id);
                            }
                        }
                    });
                } catch (final Exception e) {
                    Log.e(TAG, "Failed to edit match: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            showToast("Error updating match: " + e.getMessage());
                            Toast.makeText(MainActivity.this, "Update error: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        });
    }

    private void showDeleteMatchConfirmDialog(final MatchRecord m, final int matchNumber) {
        new AlertDialog.Builder(this)
                .setTitle("Delete Match " + matchNumber + "?")
                .setMessage("Are you sure you want to delete this match record? This cannot be undone.")
                .setPositiveButton("DELETE", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        deleteMatch(m.id);
                    }
                })
                .setNegativeButton("CANCEL", null)
                .show();
    }

    private void deleteMatch(final String matchId) {
        showToast("Deleting match...");
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    deleteHttp(baseUrl + "/api/matches?id=" + matchId);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            showToast("Match deleted!");
                            Toast.makeText(MainActivity.this, "Match deleted!", Toast.LENGTH_SHORT).show();
                            if (selectedEpisode != null) {
                                fetchStreamMatches(selectedEpisode.id);
                                fetchLiveMatch(selectedEpisode.id);
                            }
                        }
                    });
                } catch (final Exception e) {
                    Log.e(TAG, "Delete match failed: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            showToast("Delete error: " + e.getMessage());
                            Toast.makeText(MainActivity.this, "Delete failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        });
    }

    private void captureCookies(HttpURLConnection conn) {
        List<String> cookies = conn.getHeaderFields().get("Set-Cookie");
        if (cookies != null) {
            for (String c : cookies) {
                if (c.contains("dtt_admin_session=")) {
                    sessionCookie = c.split(";")[0];
                    break;
                }
            }
        }
    }

    private String readStream(InputStream is) throws Exception {
        if (is == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append('\n');
        }
        reader.close();
        return sb.toString();
    }
}
