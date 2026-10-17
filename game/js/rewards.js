/* Оригинальные карманные зверушки. Все рисунки встроены, сеть не нужна. */
(function () {
  "use strict";
  var rarities = {
    uncommon: { name: "Необычная", color: "#84e5a4" },
    rare: { name: "Редкая", color: "#82caff" },
    super: { name: "Суперредкая", color: "#d5acff" },
    mega: { name: "Мегаредкая", color: "#ffdc83" }
  };
  var chests = [
    { id: "wood", name: "Деревянный сундук", min: 0, odds: [{ rarity: "uncommon", chance: 90 }, { rarity: "rare", chance: 10 }] },
    { id: "silver", name: "Серебряный сундук", min: 10, odds: [{ rarity: "rare", chance: 75 }, { rarity: "super", chance: 25 }] },
    { id: "gold", name: "Золотой сундук", min: 25, odds: [{ rarity: "super", chance: 90 }, { rarity: "mega", chance: 10 }] }
  ];
  var pets = [
    { id: "listik", name: "Листик", rarity: "uncommon", kind: "leaf", color: "#77d98b", accent: "#297a58", bio: "Лесной ушастик выращивает дерево желаний по одному листочку.", skill: "Копим понемногу", tip: "Выбери мечту и откладывай на неё часть карманных денег. Даже маленькие суммы складываются!" },
    { id: "kaplik", name: "Каплик", rarity: "uncommon", kind: "water", color: "#71d9ed", accent: "#3679bd", bio: "Водяной малыш собирает капельки и считает каждую.", skill: "Считаем расходы", tip: "Записывай, сколько денег получил и потратил. Так легче понять, сколько осталось." },
    { id: "monetik", name: "Монетик", rarity: "uncommon", kind: "hamster", color: "#ffd49b", accent: "#bc864f", bio: "Хомячок с монеткой бережно хранит сдачу в щёчках.", skill: "Проверяем сдачу", tip: "После покупки вместе со взрослым проверь чек и сдачу. Остаток можно положить в копилку." },
    { id: "planusha", name: "Планюша", rarity: "uncommon", kind: "turtle", color: "#a9dfb8", accent: "#508b79", bio: "Черепашка с панцирем-блокнотом всегда знает, за чем идёт в магазин.", skill: "Список покупок", tip: "Перед магазином составь список со взрослым. Он поможет помнить о нужном и не покупать всё подряд." },
    { id: "iskrolis", name: "Искролис", rarity: "rare", kind: "fox", color: "#ffb36e", accent: "#e66d68", bio: "Огненный лисёнок умеет остудить даже самое горячее «хочу!».", skill: "Пауза перед покупкой", tip: "Увидел красивую вещь? Сделай паузу и подумай: она тебе нужна или просто понравилась прямо сейчас?" },
    { id: "lunokot", name: "Лунокот", rarity: "rare", kind: "cat", color: "#b6b0fa", accent: "#7061c5", bio: "Лунный котик распутывает клубки подозрительных ссылок.", skill: "Проверяем ссылки", tip: "Пришла незнакомая ссылка? Не открывай её сразу — покажи взрослому, которому доверяешь." },
    { id: "sravnysh", name: "Сравныш", rarity: "rare", kind: "owl", color: "#aacff4", accent: "#657fa8", bio: "Совёнок в очках замечает разницу даже между похожими ценниками.", skill: "Сравниваем цены", tip: "Вместе со взрослым сравни цену, размер и качество похожих вещей. Большая надпись «скидка» ещё не значит выгодно." },
    { id: "parolik", name: "Паролик", rarity: "rare", kind: "hedgehog", color: "#d6b5ec", accent: "#8856a8", bio: "Ёжик с замочком прячет секреты за крепкими иголками.", skill: "Берегём пароли", tip: "Пароль и код из СМС — секреты. Не отправляй их в чат и не называй звонящему, даже если он представился банком." },
    { id: "grozokryl", name: "Грозокрыл", rarity: "super", kind: "dragon", color: "#96b9ff", accent: "#7865dd", bio: "Грозовой дракончик закрывает друзей крыльями от чужого «срочно!».", skill: "Не спешим под давлением", tip: "Торопят перевести деньги или пугают? Остановись, закончи разговор и позови взрослого." },
    { id: "kristalup", name: "Кристалуп", rarity: "super", kind: "crystal", color: "#9de9e0", accent: "#5399d6", bio: "Кристальный зайчик строит прозрачную лестницу к своей мечте.", skill: "Планируем цель", tip: "Узнай цену своей мечты. Со взрослым посчитай, сколько ещё нужно накопить и сколько получится откладывать." },
    { id: "rezervik", name: "Резервик", rarity: "super", kind: "bear", color: "#98d6e8", accent: "#487eac", bio: "Ледяной медвежонок хранит запас снежинок на неожиданный тёплый день.", skill: "Оставляем запас", tip: "Необязательно тратить всё сразу. Оставь немного карманных денег на неожиданную нужную покупку." },
    { id: "chekofin", name: "Чекофин", rarity: "super", kind: "fin", color: "#99e4dc", accent: "#418e9c", bio: "Дельфин с плавниками-чеками помнит каждую покупку.", skill: "Храним чек", tip: "Сохрани чек после покупки и отдай взрослому. Он поможет вспомнить цену и разобраться, если с вещью что-то не так." },
    { id: "solnegrif", name: "Солнегриф", rarity: "mega", kind: "sun", color: "#ffda79", accent: "#f59664", bio: "Солнечный грифон делит лучи между делами, мечтами и добротой.", skill: "Распределяем деньги", tip: "Раздели карманные деньги на нужные покупки, мечту и запас. Со взрослым реши, сколько положить в каждую часть." },
    { id: "zvezdoryu", name: "Звездорю", rarity: "mega", kind: "cosmic", color: "#c8a4ff", accent: "#7c63da", bio: "Звёздный дракон отличает настоящие звёзды от блестящих обманок.", skill: "Распознаём фальшивый приз", tip: "Обещают приз, но просят сначала заплатить или назвать данные карты? Не соглашайся и покажи сообщение взрослому." },
    { id: "fenikash", name: "Феникаш", rarity: "mega", kind: "phoenix", color: "#ffc18b", accent: "#d56b78", bio: "Радужный феникс превращает промахи в новые полезные привычки.", skill: "Учимся на ошибках", tip: "Потратил деньги и пожалел? Расскажи взрослому и подумай, что сделаешь иначе в следующий раз. Ошибки помогают учиться." },
    { id: "shchitorn", name: "Щиторн", rarity: "mega", kind: "unicorn", color: "#dfd7ff", accent: "#9c7cca", bio: "Единорог со щитом зовёт команду, когда одному трудно разобраться.", skill: "Обращаемся за помощью", tip: "Если речь о деньгах и что-то непонятно или тревожно, спроси взрослого, которому доверяешь. Просить помощи — полезный навык." }
  ];

  function chestFor(coins) {
    for (var i = chests.length - 1; i >= 0; i--) if (coins >= chests[i].min) return chests[i];
    return chests[0];
  }
  function roll(chest, random) {
    random = random || Math.random;
    var value = random() * 100, total = 0, rarity = chest.odds[chest.odds.length - 1].rarity;
    for (var i = 0; i < chest.odds.length; i++) {
      total += chest.odds[i].chance;
      if (value < total) { rarity = chest.odds[i].rarity; break; }
    }
    var pool = pets.filter(function (pet) { return pet.rarity === rarity; });
    return pool[Math.floor(random() * pool.length)];
  }

  function art(pet) {
    var extra = {
      leaf: '<path d="M65 91Q34 24 73 39L91 88M109 86Q116 22 139 39L130 98" fill="' + pet.color + '"/><path d="M90 52Q98 16 126 27Q124 53 90 52" fill="' + pet.accent + '"/>',
      water: '<path d="M78 91Q53 66 74 38Q77 63 98 69M122 84Q152 55 142 38Q170 72 137 97" fill="' + pet.color + '"/><circle cx="41" cy="106" r="9" fill="#bbf5ff"/><circle cx="160" cy="65" r="6" fill="#bbf5ff"/>',
      fox: '<path d="M134 137Q196 151 166 76Q156 112 129 103" fill="' + pet.accent + '"/><path d="M166 76Q181 102 176 116L156 107Z" fill="#fff0cf"/><path d="M64 88L55 27L96 65M108 65L148 27L137 92" fill="' + pet.color + '"/><path d="M68 69L64 45L84 67M119 68L139 45L134 72" fill="' + pet.accent + '"/>',
      cat: '<path d="M137 139Q176 157 167 113Q164 104 158 112" fill="none" stroke="' + pet.accent + '" stroke-width="13"/><path d="M62 91L61 35L94 65M108 65L140 35L140 94" fill="' + pet.color + '"/>',
      dragon: '<path d="M65 110L20 63L25 116L60 145M135 110L180 63L175 116L140 145" fill="' + pet.accent + '"/><path d="M23 73L49 120L31 111M177 73L151 120L169 111" fill="' + pet.color + '"/><path d="M74 77L76 40L94 67M109 67L124 40L130 80" fill="#ffe09b"/>',
      crystal: '<path d="M68 85L59 35L78 18L93 78M108 78L122 18L141 35L133 87" fill="' + pet.color + '"/><path d="M62 39L78 24L81 67M121 67L123 24L138 39" fill="' + pet.accent + '"/><path d="M23 99L34 77L45 99L34 122Z M155 65L166 43L177 65L166 88Z" fill="#d1ffff"/>',
      sun: '<path d="M62 116Q7 122 23 61L65 91M138 116Q193 122 177 61L135 91" fill="' + pet.accent + '"/><path d="M32 78L51 111M168 78L149 111" stroke="#ffeab3" stroke-width="7"/><path d="M67 72L57 43L83 53L100 24L117 53L143 43L133 76" fill="#ffe9aa"/>',
      cosmic: '<path d="M62 112L18 51L26 119L63 147M138 112L182 51L174 119L137 147" fill="' + pet.accent + '"/><path d="M72 73L65 33L93 59M107 59L135 33L128 73" fill="' + pet.color + '"/><path d="M22 54L42 107M178 54L158 107" stroke="#b5eaff" stroke-width="4"/><path d="M43 35L47 45L57 49L47 53L43 63L39 53L29 49L39 45Z" fill="#ffdf85"/>',
      hamster: '<circle cx="64" cy="63" r="22" fill="' + pet.accent + '"/><circle cx="136" cy="63" r="22" fill="' + pet.accent + '"/><circle cx="64" cy="63" r="13" fill="#ffd7d4"/><circle cx="136" cy="63" r="13" fill="#ffd7d4"/>',
      turtle: '<ellipse cx="100" cy="127" rx="63" ry="41" fill="' + pet.accent + '"/><path d="M47 124L75 105L100 121L126 105L153 124M75 105L76 155M126 105L124 155" fill="none" stroke="' + pet.color + '" stroke-width="4"/><path d="M81 65L85 41L115 41L119 65" fill="' + pet.color + '"/>',
      owl: '<path d="M54 96L43 47L88 63M112 63L157 47L146 96" fill="' + pet.accent + '"/><ellipse cx="51" cy="129" rx="17" ry="32" fill="' + pet.color + '"/><ellipse cx="149" cy="129" rx="17" ry="32" fill="' + pet.color + '"/>',
      hedgehog: '<path d="M44 141L28 112L42 98L31 73L55 70L58 44L82 54L100 29L117 54L143 43L145 70L169 73L158 98L172 112L156 141Z" fill="' + pet.accent + '"/>',
      bear: '<circle cx="63" cy="63" r="22" fill="' + pet.color + '"/><circle cx="137" cy="63" r="22" fill="' + pet.color + '"/><circle cx="63" cy="63" r="12" fill="' + pet.accent + '"/><circle cx="137" cy="63" r="12" fill="' + pet.accent + '"/>',
      fin: '<path d="M64 125L23 101Q23 141 61 148M136 125L177 101Q177 141 139 148M90 65L105 26L125 70" fill="' + pet.accent + '"/>',
      phoenix: '<path d="M61 135Q10 121 24 51L66 93M139 135Q190 121 176 51L134 93M76 74L65 38L91 52L100 22L112 52L139 38L125 76" fill="' + pet.accent + '"/><path d="M27 67L48 114M173 67L152 114" stroke="#ffe9a0" stroke-width="6"/><path d="M81 153L73 184L100 169L128 184L119 153" fill="#ffda79"/>',
      unicorn: '<path d="M66 86L54 41L86 65M114 65L146 41L134 86" fill="' + pet.color + '"/><path d="M88 67L100 15L112 67Z" fill="#ffe49c"/><path d="M95 40L106 45M92 53L109 58" stroke="#dcaa61" stroke-width="3"/><path d="M139 80Q164 88 151 116L141 139" fill="none" stroke="' + pet.accent + '" stroke-width="16"/>'
    };
    var emblem = pet.kind === "cat" ? '<path d="M105 72A12 12 0 1 1 92 59A10 10 0 0 0 105 72" fill="#fff0b5"/>' :
      '<path d="M100 61L104 70L114 72L107 79L109 89L100 84L91 89L93 79L86 72L96 70Z" fill="#fff5cf"/>';
    var badge = {
      hamster: '<circle cx="100" cy="140" r="15" fill="#ffe391" stroke="#bc864f" stroke-width="3"/><path d="M97 134L102 131V149M97 149H107" stroke="#946029" stroke-width="3" fill="none"/>',
      turtle: '<rect x="86" y="130" width="28" height="23" rx="4" fill="#fff3c7"/><path d="M91 137H109M91 144H104" stroke="#508b79" stroke-width="2"/>',
      owl: '<g fill="none" stroke="#344b72" stroke-width="3"><circle cx="79" cy="100" r="15"/><circle cx="121" cy="100" r="15"/><path d="M94 99H106"/></g>',
      hedgehog: '<rect x="88" y="135" width="24" height="19" rx="4" fill="#ffe6a2"/><path d="M93 135V130A7 7 0 0 1 107 130V135" fill="none" stroke="#ffe6a2" stroke-width="4"/><circle cx="100" cy="144" r="3" fill="#8856a8"/>',
      bear: '<path d="M88 138L100 125L112 138L100 153Z" fill="#e6fbff"/><path d="M100 130V148M93 138H107" stroke="#487eac" stroke-width="2"/>',
      fin: '<path d="M88 128H113V156L108 152L103 156L98 152L93 156L88 152Z" fill="#f4ffff"/><path d="M93 136H108M93 143H105" stroke="#418e9c" stroke-width="2"/>',
      unicorn: '<path d="M100 126L116 132V141Q115 153 100 159Q85 153 84 141V132Z" fill="#fff0bf"/><path d="M93 141L98 146L108 135" stroke="#9c7cca" stroke-width="3" fill="none"/>'
    };
    return '<svg viewBox="0 0 200 190" role="img" aria-label="' + pet.name + '" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="100" cy="171" rx="53" ry="9" fill="#000" opacity=".18"/>' + extra[pet.kind] +
      '<ellipse cx="100" cy="124" rx="43" ry="44" fill="' + pet.accent + '"/>' +
      '<ellipse cx="100" cy="129" rx="29" ry="30" fill="#fff" opacity=".45"/>' +
      '<ellipse cx="69" cy="161" rx="17" ry="10" fill="' + pet.color + '"/><ellipse cx="131" cy="161" rx="17" ry="10" fill="' + pet.color + '"/>' +
      '<rect x="52" y="58" width="96" height="79" rx="37" fill="' + pet.color + '"/>' + emblem +
      '<ellipse cx="79" cy="99" rx="8" ry="11" fill="#fff"/><ellipse cx="121" cy="99" rx="8" ry="11" fill="#fff"/>' +
      '<ellipse cx="81" cy="101" rx="5" ry="7" fill="#203049"/><ellipse cx="119" cy="101" rx="5" ry="7" fill="#203049"/>' +
      '<circle cx="82" cy="98" r="2" fill="#fff"/><circle cx="120" cy="98" r="2" fill="#fff"/>' +
      '<ellipse cx="68" cy="115" rx="8" ry="4" fill="#ff8b9a" opacity=".65"/><ellipse cx="132" cy="115" rx="8" ry="4" fill="#ff8b9a" opacity=".65"/>' +
      '<path d="M93 115Q100 123 107 115" fill="none" stroke="#203049" stroke-width="3" stroke-linecap="round"/>' + (badge[pet.kind] || "") + '</svg>';
  }
  window.RunRewards = { rarities: rarities, chests: chests, pets: pets, chestFor: chestFor, roll: roll, art: art };
})();
