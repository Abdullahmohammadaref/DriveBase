"""
Generate World Countries and Cities Catalog
============================================
Compiles an exhaustive catalog of all recognized sovereign countries on Earth (196 countries)
and their major cities (capitals, commercial, and automotive hubs).
Outputs: backend/scripts/data/world_cities_catalog.json
"""

import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTPUT_FILE = os.path.join(BASE_DIR, "scripts", "data", "world_cities_catalog.json")

# 196 Recognized Sovereign Countries and Entities
WORLD_DATA = {
    # -------------------------------------------------------------------------
    # DACH & Direct German Neighbors (Expansive)
    # -------------------------------------------------------------------------
    "Deutschland": [
        "Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart", "Düsseldorf",
        "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden", "Hannover", "Nürnberg", "Duisburg",
        "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg",
        "Wiesbaden", "Gelsenkirchen", "Mönchengladbach", "Braunschweig", "Chemnitz", "Kiel", "Aachen",
        "Halle (Saale)", "Magdeburg", "Freiburg im Breisgau", "Krefeld", "Lübeck", "Oberhausen",
        "Erfurt", "Mainz", "Rostock", "Kassel", "Hagen", "Hamm", "Saarbrücken", "Mülheim an der Ruhr",
        "Potsdam", "Ludwigshafen am Rhein", "Oldenburg", "Leverkusen", "Osnabrück", "Solingen",
        "Heidelberg", "Herne", "Neuss", "Darmstadt", "Paderborn", "Regensburg", "Ingolstadt",
        "Würzburg", "Fürth", "Wolfsburg", "Offenbach am Main", "Ulm", "Heilbronn", "Pforzheim",
        "Göttingen", "Bottrop", "Trier", "Recklinghausen", "Reutlingen", "Bremerhaven", "Koblenz",
        "Bergisch Gladbach", "Jena", "Remscheid", "Erlangen", "Moers", "Siegen", "Hildesheim", "Salzgitter"
    ],
    "Österreich": [
        "Wien", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt", "Villach", "Wels", "St. Pölten", "Dornbirn", "Bregenz", "Eisenstadt"
    ],
    "Schweiz": [
        "Zürich", "Genf", "Basel", "Bern", "Lausanne", "Winterthur", "Luzern", "St. Gallen", "Lugano", "Biel/Bienne", "Thun", "Bellinzona", "Chur", "Schaffhausen"
    ],
    "Niederlande": [
        "Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven", "Groningen", "Tilburg", "Almere", "Breda", "Nijmegen", "Enschede", "Haarlem", "Arnhem", "Maastricht"
    ],
    "Belgien": [
        "Brüssel", "Antwerpen", "Gent", "Charleroi", "Lüttich", "Brügge", "Namur", "Leuven", "Mons", "Aalst", "Mechelen", "Kortrijk"
    ],
    "Luxemburg": [
        "Luxemburg", "Esch an der Alzette", "Differdingen", "Düdelingen", "Ettelbrück", "Diekirch", "Wiltz"
    ],
    "Frankreich": [
        "Paris", "Marseille", "Lyon", "Toulouse", "Nizza", "Nantes", "Straßburg", "Montpellier", "Bordeaux", "Lille", "Rennes", "Reims", "Le Havre", "Saint-Étienne", "Toulon", "Grenoble", "Dijon", "Angers"
    ],
    "Italien": [
        "Rom", "Mailand", "Neapel", "Turin", "Palermo", "Genua", "Bologna", "Florenz", "Bari", "Catania", "Venedig", "Verona", "Messina", "Padua", "Triest", "Brescia", "Parma", "Modena"
    ],
    "Polen": [
        "Warschau", "Krakau", "Breslau", "Lodz", "Posen", "Danzig", "Stettin", "Bromberg", "Lublin", "Kattowitz", "Białystok", "Gdynia", "Częstochowa", "Radom"
    ],
    "Tschechien": [
        "Prag", "Brünn", "Ostrau", "Pilsen", "Reichenberg", "Olmütz", "Budweis", "Königgrätz", "Aussig", "Pardubitz", "Zlín", "Karlovy Vary"
    ],
    "Dänemark": [
        "Kopenhagen", "Aarhus", "Odense", "Aalborg", "Esbjerg", "Randers", "Kolding", "Horsens", "Vejle", "Roskilde", "Herning", "Silkeborg"
    ],
    "Liechtenstein": [
        "Vaduz", "Schaan", "Balzers", "Triesen", "Eschen", "Mauren"
    ],

    # -------------------------------------------------------------------------
    # Rest of Europe
    # -------------------------------------------------------------------------
    "Albanien": ["Tirana", "Durrës", "Vlora", "Shkodra", "Fier", "Korça", "Elbasan"],
    "Andorra": ["Andorra la Vella", "Escaldes-Engordany", "Encamp", "Sant Julià de Lòria"],
    "Belarus": ["Minsk", "Homel", "Mahiljou", "Wizebsk", "Hrodna", "Brest", "Babrujsk"],
    "Bosnien und Herzegowina": ["Sarajevo", "Banja Luka", "Tuzla", "Zenica", "Mostar", "Bijeljina", "Brčko"],
    "Bulgarien": ["Sofia", "Plowdiw", "Warna", "Burgas", "Russe", "Stara Sagora", "Plewen", "Sliwen"],
    "Estland": ["Tallinn", "Tartu", "Narva", "Pärnu", "Kohtla-Järve", "Viljandi"],
    "Finnland": ["Helsinki", "Espoo", "Tampere", "Vantaa", "Oulu", "Turku", "Jyväskylä", "Lahti", "Kuopio"],
    "Griechenland": ["Athen", "Thessaloniki", "Patras", "Heraklion", "Larisa", "Volos", "Ioannina", "Chania", "Rhodos"],
    "Irland": ["Dublin", "Cork", "Limerick", "Galway", "Waterford", "Drogheda", "Dundalk"],
    "Island": ["Reykjavík", "Kópavogur", "Hafnarfjörður", "Akureyri", "Reykjanesbær"],
    "Kosovo": ["Pristina", "Prizren", "Ferizaj", "Peja", "Gjakova", "Gjilan", "Mitrovica"],
    "Kroatien": ["Zagreb", "Split", "Rijeka", "Osijek", "Zadar", "Slavonski Brod", "Pula", "Karlovac", "Dubrovnik"],
    "Lettland": ["Riga", "Daugavpils", "Liepāja", "Jelgava", "Jūrmala", "Ventspils"],
    "Litauen": ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Panevėžys", "Alytus"],
    "Malta": ["Valletta", "Birkirkara", "Mosta", "Sliema", "Qormi", "St. Paul's Bay"],
    "Moldawien": ["Chișinău", "Bălți", "Tiraspol", "Bender", "Rîbnița"],
    "Monaco": ["Monaco", "Monte-Carlo", "La Condamine", "Fontvieille"],
    "Montenegro": ["Podgorica", "Nikšić", "Herceg Novi", "Bar", "Budva", "Kotor"],
    "Nordmazedonien": ["Skopje", "Bitola", "Kumanovo", "Prilep", "Tetovo", "Ohrid"],
    "Norwegen": ["Oslo", "Bergen", "Trondheim", "Stavanger", "Bærum", "Kristiansand", "Drammen", "Tromsø"],
    "Portugal": ["Lissabon", "Porto", "Vila Nova de Gaia", "Amadora", "Braga", "Funchal", "Coimbra", "Setúbal", "Faro"],
    "Rumänien": ["Bukarest", "Klausenburg", "Timișoara", "Iași", "Constanța", "Craiova", "Brașov", "Galați", "Ploiești", "Oradea"],
    "Russland": ["Moskau", "Sankt Petersburg", "Nowosibirsk", "Jekaterinburg", "Kasan", "Nischni Nowgorod", "Tscheljabinsk", "Samara", "Omsk", "Rostow am Don", "Ufa", "Krasnojarsk"],
    "San Marino": ["San Marino", "Serravalle", "Borgo Maggiore", "Domagnano"],
    "Schweden": ["Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås", "Örebro", "Linköping", "Helsingborg", "Jönköping", "Norrköping"],
    "Serbien": ["Belgrad", "Novi Sad", "Niš", "Kragujevac", "Subotica", "Zrenjanin", "Pančevo", "Čačak"],
    "Slowakei": ["Bratislava", "Košice", "Prešov", "Žilina", "Banská Bystrica", "Nitra", "Trnava", "Trenčín"],
    "Slowenien": ["Ljubljana", "Maribor", "Celje", "Kranj", "Koper", "Velenje", "Novo Mesto"],
    "Spanien": ["Madrid", "Barcelona", "Valencia", "Sevilla", "Saragossa", "Málaga", "Murcia", "Palma de Mallorca", "Las Palmas", "Bilbao", "Alicante", "Córdoba", "Valladolid", "Vigo", "Gijón"],
    "Türkei": ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana", "Konya", "Gaziantep", "Şanlıurfa", "Mersin", "Diyarbakır", "Kayseri", "Samsun", "Trabzon"],
    "Ukraine": ["Kiew", "Charkiw", "Odessa", "Dnipro", "Donezk", "Saporischschja", "Lwiw", "Krywyj Rih", "Mykolajiw", "Winnyzja"],
    "Ungarn": ["Budapest", "Debrecen", "Szeged", "Miskolc", "Pécs", "Győr", "Nyíregyháza", "Kecskemét", "Székesfehérvár"],
    "Vatikanstadt": ["Vatikanstadt"],
    "Vereinigtes Königreich": ["London", "Birmingham", "Glasgow", "Liverpool", "Bristol", "Manchester", "Sheffield", "Leeds", "Edinburgh", "Leicester", "Coventry", "Cardiff", "Belfast", "Newcastle"],
    "Zypern": ["Nikosia", "Limassol", "Larnaka", "Paphos", "Famagusta", "Kyrenia"],

    # -------------------------------------------------------------------------
    # Americas
    # -------------------------------------------------------------------------
    "Antigua und Barbuda": ["St. John's", "All Saints", "Liberta"],
    "Argentinien": ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata", "San Miguel de Tucumán", "Mar del Plata", "Salta"],
    "Bahamas": ["Nassau", "Freeport", "West End"],
    "Barbados": ["Bridgetown", "Speightstown", "Oistins"],
    "Belize": ["Belize City", "Belmopan", "San Ignacio", "Orange Walk"],
    "Bolivien": ["La Paz", "Santa Cruz de la Sierra", "Cochabamba", "Sucre", "Oruro", "Tarija"],
    "Brasilien": ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza", "Belo Horizonte", "Manaus", "Curitiba", "Recife", "Porto Alegre"],
    "Chile": ["Santiago de Chile", "Valparaíso", "Concepción", "La Serena", "Antofagasta", "Temuco", "Iquique"],
    "Costa Rica": ["San José", "Alajuela", "Cartago", "Heredia", "Liberia", "Puntarenas"],
    "Dominica": ["Roseau", "Portsmouth", "Marigot"],
    "Dominikanische Republik": ["Santo Domingo", "Santiago de los Caballeros", "Santo Domingo Este", "Puerto Plata", "La Romana"],
    "Ecuador": ["Quito", "Guayaquil", "Cuenca", "Santo Domingo", "Machala", "Manta", "Portoviejo"],
    "El Salvador": ["San Salvador", "Soyapango", "Santa Ana", "San Miguel", "Mejicanos"],
    "Grenada": ["St. George's", "Gouyave", "Grenville"],
    "Guatemala": ["Guatemala-Stadt", "Mixco", "Villa Nueva", "Quetzaltenango", "Escuintla"],
    "Guyana": ["Georgetown", "Linden", "New Amsterdam", "Bartica"],
    "Haiti": ["Port-au-Prince", "Carrefour", "Delmas", "Cap-Haïtien", "Gonaïves"],
    "Honduras": ["Tegucigalpa", "San Pedro Sula", "Choloma", "La Ceiba", "El Progreso"],
    "Jamaika": ["Kingston", "Montego Bay", "Spanish Town", "Portmore"],
    "Kanada": ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg", "Quebec", "Hamilton", "Halifax"],
    "Kolumbien": ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Cúcuta", "Bucaramanga", "Pereira"],
    "Kuba": ["Havanna", "Santiago de Cuba", "Camagüey", "Holguín", "Santa Clara", "Guantánamo"],
    "Mexiko": ["Mexiko-Stadt", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "León", "Juárez", "Zapopan", "Mérida", "Cancún"],
    "Nicaragua": ["Managua", "León", "Masaya", "Matagalpa", "Chinandega", "Granada"],
    "Panama": ["Panama-Stadt", "San Miguelito", "Tocumen", "David", "Arraiján", "Colón"],
    "Paraguay": ["Asunción", "Ciudad del Este", "San Lorenzo", "Luque", "Capiatá", "Encarnación"],
    "Peru": ["Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Cusco", "Iquitos"],
    "St. Kitts und Nevis": ["Basseterre", "Charlestown", "Sadlers"],
    "St. Lucia": ["Castries", "Vieux Fort", "Gros Islet", "Soufrière"],
    "St. Vincent und die Grenadinen": ["Kingstown", "Georgetown", "Barrouallie"],
    "Suriname": ["Paramaribo", "Lelydorp", "Nieuw Nickerie"],
    "Trinidad und Tobago": ["Port of Spain", "Chaguanas", "San Fernando", "Arima"],
    "Uruguay": ["Montevideo", "Salto", "Ciudad de la Costa", "Paysandú", "Las Piedras", "Maldonado"],
    "Venezuela": ["Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay", "Ciudad Guayana", "San Cristóbal"],
    "Vereinigte Staaten von Amerika": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "San Francisco", "Indianapolis", "Columbus", "Fort Worth", "Charlotte", "Seattle", "Denver", "Washington, D.C.", "Boston", "Detroit", "Nashville", "Portland", "Las Vegas", "Miami", "Atlanta"],

    # -------------------------------------------------------------------------
    # Asia & Middle East
    # -------------------------------------------------------------------------
    "Afghanistan": ["Kabul", "Kandahar", "Herat", "Masar-e Scharif", "Dschalalabad", "Kundus"],
    "Armenien": ["Jerewan", "Gjumri", "Wanadsor", "Wagharschapat", "Hrasdan"],
    "Aserbaidschan": ["Baku", "Gəncə", "Sumqayıt", "Mingəçevir", "Şirvan", "Naxçıvan"],
    "Bahrain": ["Manama", "Riffa", "al-Muharraq", "Hamad Town", "A'ali"],
    "Bangladesch": ["Dhaka", "Chittagong", "Khulna", "Rajshahi", "Sylhet", "Bogra", "Mymensingh"],
    "Bhutan": ["Thimphu", "Phuntsholing", "Punakha", "Paro"],
    "Brunei": ["Bandar Seri Begawan", "Kuala Belait", "Seria", "Tutong"],
    "China": ["Peking", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Chongqing", "Hangzhou", "Wuhan", "Xi'an", "Suzhou", "Tianjin", "Nanjing", "Dongguan", "Shenyang", "Qingdao", "Changsha", "Dalian", "Xiamen"],
    "Georgien": ["Tiflis", "Batumi", "Kutaissi", "Rustawi", "Gori", "Zugdidi"],
    "Indien": ["Neu-Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Ahmedabad", "Chennai", "Kalkutta", "Surat", "Pune", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore", "Bhopal"],
    "Indonesien": ["Jakarta", "Surabaya", "Bandung", "Medan", "Bekasi", "Serang", "Depok", "Semarang", "Palembang", "Makassar"],
    "Irak": ["Bagdad", "Basra", "Mossul", "Erbil", "Sulaimaniyya", "Nadschaf", "Kerbela", "Kirkuk"],
    "Iran": ["Teheran", "Maschhad", "Isfahan", "Karadsch", "Schiras", "Täbris", "Ghom", "Ahvaz", "Kermanschah", "Urmia"],
    "Israel": ["Tel Aviv", "Jerusalem", "Haifa", "Rischon LeZion", "Petach Tikwa", "Aschdod", "Netanja", "Be’er Schewa"],
    "Japan": ["Tokio", "Yokohama", "Osaka", "Nagoya", "Sapporo", "Fukuoka", "Kobe", "Kyoto", "Kawasaki", "Saitama", "Hiroshima", "Sendai", "Chiba", "Kitakyushu"],
    "Jemen": ["Sanaa", "Aden", "Taiz", "al-Hudaida", "Ibb", "al-Mukalla"],
    "Jordanien": ["Amman", "Zarqa", "Irbid", "Russeifa", "Aqaba", "Madaba", "as-Salt"],
    "Kambodscha": ["Phnom Penh", "Siem Reap", "Battambang", "Sihanoukville", "Poipet"],
    "Kasachstan": ["Almaty", "Astana", "Schymkent", "Qaraghandy", "Aqtöbe", "Taras", "Pawlodar", "Öskemen"],
    "Katar": ["Doha", "al-Wakra", "al-Chaur", "ar-Rayyan", "Umm Salal"],
    "Kirgisistan": ["Bischkek", "Osch", "Dschalalabat", "Karakol", "Tokmok"],
    "Kuwait": ["Kuwait-Stadt", "al-Ahmadi", "Hawalli", "Salmiya", "Sabah as-Salim"],
    "Laos": ["Vientiane", "Pakse", "Savannakhet", "Luang Prabang"],
    "Libanon": ["Beirut", "Tripoli", "Sidon", "Tyros", "Zahlé", "Jounieh", "Nabatäa"],
    "Malaysia": ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Shah Alam", "Petaling Jaya", "Melaka", "Kota Kinabalu", "Kuching"],
    "Malediven": ["Malé", "Addu City", "Fuvahmulah", "Kulhudhuffushi"],
    "Mongolei": ["Ulaanbaatar", "Erdenet", "Darchan", "Tschoibalsan"],
    "Myanmar": ["Rangun", "Mandalay", "Naypyidaw", "Mawlamyaing", "Bago", "Pathein"],
    "Nepal": ["Kathmandu", "Pokhara", "Lalitpur", "Bharatpur", "Biratnagar", "Birganj"],
    "Nordkorea": ["Pjöngjang", "Hamhŭng", "Ch’ŏngjin", "Namp’o", "Wŏnsan", "Sinŭiju"],
    "Oman": ["Maskat", "Salala", "Suhar", "Nizwa", "Sur", "Seeb", "al-Chabura"],
    "Pakistan": ["Islamabad", "Karatschi", "Lahore", "Faisalabad", "Rawalpindi", "Gujranwala", "Peschawar", "Multan", "Hyderabad", "Quetta"],
    "Palästina": ["Ramallah", "Gaza", "Hebron", "Nablus", "Bethlehem", "Dschenin", "Tulkarm", "Jericho"],
    "Philippinen": ["Manila", "Quezon City", "Davao City", "Caloocan", "Cebu City", "Zamboanga", "Taguig", "Pasig", "Cagayan de Oro"],
    "Saudi-Arabien": ["Riad", "Dschidda", "Mekka", "Medina", "Dammam", "Taif", "Tabuk", "Buraida", "Chobar", "Abha"],
    "Singapur": ["Singapur"],
    "Sri Lanka": ["Colombo", "Dehiwala-Mount Lavinia", "Moratuwa", "Kandy", "Negombo", "Galle", "Jaffna"],
    "Südkorea": ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Ulsan", "Changwon", "Seongnam"],
    "Syrien": ["Damaskus", "Aleppo", "Homs", "Latakia", "Hama", "Raqqa", "Deir ez-Zor"],
    "Tadschikistan": ["Duschanbe", "Chodschand", "Bochtar", "Kulob", "Istarawschan"],
    "Taiwan": ["Taipeh", "Neu-Taipeh", "Kaohsiung", "Taichung", "Tainan", "Taoyuan", "Hsinchu", "Keelung"],
    "Thailand": ["Bangkok", "Nonthaburi", "Nakhon Ratchasima", "Chiang Mai", "Hat Yai", "Udon Thani", "Pattaya", "Khon Kaen", "Phuket"],
    "Turkmenistan": ["Aşgabat", "Türkmenabat", "Daşoguz", "Mary", "Balkanabat"],
    "Usbekistan": ["Taschkent", "Samarkand", "Buchara", "Namangan", "Andijon", "Nukus", "Fargʻona"],
    "Vereinigte Arabische Emirate": ["Dubai", "Abu Dhabi", "Schardscha", "al-Ain", "Adschman", "Ras al-Chaimah", "Fudschaira", "Umm al-Qaiwain"],
    "Vietnam": ["Hanoi", "Ho-Chi-Minh-Stadt", "Da Nang", "Hai Phong", "Can Tho", "Bien Hoa", "Nha Trang", "Hue", "Vung Tau"],

    # -------------------------------------------------------------------------
    # Africa
    # -------------------------------------------------------------------------
    "Ägypten": ["Kairo", "Alexandria", "Gizeh", "Schubra al-Chaima", "Port Said", "Sues", "Luxor", "Assuan", "Tanta", "al-Mansura"],
    "Algerien": ["Algier", "Oran", "Constantine", "Batna", "Djelfa", "Sétif", "Annaba", "Blida"],
    "Angola": ["Luanda", "Huambo", "Lobito", "Benguela", "Lubango", "Malanje"],
    "Äquatorialguinea": ["Malabo", "Bata", "Ebebiyín", "Aconibe"],
    "Äthiopien": ["Addis Abeba", "Dire Dawa", "Mek’ele", "Gondar", "Hawassa", "Bahir Dar", "Jimma"],
    "Benin": ["Cotonou", "Abomey-Calavi", "Porto-Novo", "Parakou", "Djougou"],
    "Botswana": ["Gaborone", "Francistown", "Molepolole", "Maun", "Serowe"],
    "Burkina Faso": ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya", "Banfora"],
    "Burundi": ["Bujumbura", "Gitega", "Ngozi", "Rumonge"],
    "Dschibuti": ["Dschibuti", "Ali Sabieh", "Tadjoura", "Obock"],
    "Elfenbeinküste": ["Abidjan", "Bouaké", "Daloa", "Yamoussoukro", "San-Pédro", "Korhogo"],
    "Eritrea": ["Asmara", "Keren", "Massawa", "Assab", "Mendefera"],
    "Eswatini": ["Mbabane", "Manzini", "Big Bend", "Mhlume"],
    "Gabun": ["Libreville", "Port-Gentil", "Franceville", "Oyem", "Moanda"],
    "Gambia": ["Banjul", "Serekunda", "Brikama", "Bakau", "Farafenni"],
    "Ghana": ["Accra", "Kumasi", "Tamale", "Takoradi", "Ashaiman", "Tema", "Cape Coast"],
    "Guinea": ["Conakry", "Nzérékoré", "Kankan", "Kindia", "Labé"],
    "Guinea-Bissau": ["Bissau", "Bafatá", "Gabú", "Bissora"],
    "Kamerun": ["Douala", "Jaunde", "Bamenda", "Bafoussam", "Garoua", "Maroua"],
    "Kap Verde": ["Praia", "Mindelo", "Espargos", "Assomada"],
    "Kenia": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Ruiru", "Malindi"],
    "Komoren": ["Moroni", "Mutsamudu", "Fomboni", "Domoni"],
    "Kongo (Dem. Rep.)": ["Kinshasa", "Lubumbashi", "Mbuji-Mayi", "Kananga", "Kisangani", "Bukavu", "Goma"],
    "Kongo (Rep.)": ["Brazzaville", "Pointe-Noire", "Dolisie", "Nkayi"],
    "Lesotho": ["Maseru", "Teyateyaneng", "Mafeteng", "Hlotse"],
    "Liberia": ["Monrovia", "Gbarnga", "Kakata", "Bensonville"],
    "Libyen": ["Tripolis", "Bengasi", "Misrata", "al-Baida", "az-Zawiya", "Tobruk"],
    "Madagaskar": ["Antananarivo", "Toamasina", "Antsirabe", "Mahajanga", "Fianarantsoa"],
    "Malawi": ["Lilongwe", "Blantyre", "Mzuzu", "Zomba", "Kasungu"],
    "Mali": ["Bamako", "Sikasso", "Mopti", "Koutiala", "Kayes", "Ségou"],
    "Marokko": ["Casablanca", "Fès", "Tanger", "Marrakesch", "Salé", "Rabat", "Meknès", "Oujda", "Kenitra", "Agadir", "Tétouan"],
    "Mauretanien": ["Nouakchott", "Nouadhibou", "Kiffa", "Atar"],
    "Mauritius": ["Port Louis", "Beau Bassin-Rose Hill", "Vacoas-Phoenix", "Curepipe", "Quatre Bornes"],
    "Mosambik": ["Maputo", "Matola", "Nampula", "Beira", "Chimoio", "Nacala"],
    "Namibia": ["Windhoek", "Rundu", "Walvis Bay", "Swakopmund", "Oshakati"],
    "Niger": ["Niamey", "Zinder", "Maradi", "Agadez", "Tahoua"],
    "Nigeria": ["Lagos", "Kano", "Ibadan", "Abuja", "Port Harcourt", "Benin City", "Kaduna", "Maiduguri", "Zaria", "Aba", "Jos", "Ilorin"],
    "Ruanda": ["Kigali", "Butare", "Gisenyi", "Ruhengeri", "Gitarama"],
    "Sambia": ["Lusaka", "Kitwe", "Ndola", "Kabwe", "Chingola", "Mufulira"],
    "São Tomé und Príncipe": ["São Tomé", "Trindade", "Santana", "Neves"],
    "Senegal": ["Dakar", "Pikine", "Touba", "Thiès", "Kaolack", "M'bour", "Saint-Louis", "Ziguinchor"],
    "Seychellen": ["Victoria", "Anse Etoile", "Beau Vallon"],
    "Sierra Leone": ["Freetown", "Bo", "Kenema", "Koidu", "Makeni"],
    "Simbabwe": ["Harare", "Bulawayo", "Chitungwiza", "Mutare", "Gweru", "Epworth"],
    "Somalia": ["Mogadischu", "Hargeysa", "Kismaayo", "Berbera", "Boosaaso", "Galkaio"],
    "Südafrika": ["Johannesburg", "Kapstadt", "Durban", "Pretoria", "Port Elizabeth", "Bloemfontein", "East London", "Nelspruit", "Polokwane", "Kimberley"],
    "Sudan": ["Khartum", "Omdurman", "Nyala", "Port Sudan", "Kassala", "al-Ubayyid"],
    "Südsudan": ["Juba", "Malakal", "Wau", "Yei", "Yambio"],
    "Tansania": ["Dar es Salaam", "Mwanza", "Arusha", "Dodoma", "Mbeya", "Morogoro", "Tanga", "Zanzibar"],
    "Togo": ["Lomé", "Sokodé", "Kara", "Kpalimé", "Atakpamé"],
    "Tschad": ["N’Djamena", "Moundou", "Sarh", "Abéché", "Kélo"],
    "Tunesien": ["Tunis", "Sfax", "Sousse", "Kairouan", "Bizerte", "Gabès", "Ariana", "Gafsa"],
    "Uganda": ["Kampala", "Nansana", "Kira", "Mbarara", "Mukono", "Gulu", "Jinja"],
    "Zentralafrikanische Republik": ["Bangui", "Bimbo", "Berbérati", "Carnot", "Bambari"],

    # -------------------------------------------------------------------------
    # Oceania
    # -------------------------------------------------------------------------
    "Australien": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Newcastle", "Wollongong", "Hobart", "Geelong", "Darwin"],
    "Fidschi": ["Suva", "Lautoka", "Nadi", "Labasa"],
    "Kiribati": ["South Tarawa", "Betio", "Bikenibeu"],
    "Marshallinseln": ["Majuro", "Ebeye", "Arno"],
    "Mikronesien": ["Palikir", "Weno", "Kolonia", "Tol"],
    "Nauru": ["Yaren", "Denigomodu", "Meneng"],
    "Neuseeland": ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Napier-Hastings", "Dunedin", "Palmerston North"],
    "Palau": ["Ngerulmud", "Koror", "Airai"],
    "Papua-Neuguinea": ["Port Moresby", "Lae", "Arawa", "Mount Hagen", "Madang"],
    "Salomonen": ["Honiara", "Gizo", "Auki"],
    "Samoa": ["Apia", "Asau", "Mulifanua"],
    "Tonga": ["Nukuʻalofa", "Neiafu", "Haveluloto"],
    "Tuvalu": ["Funafuti", "Asau"],
    "Vanuatu": ["Port Vila", "Luganville", "Norsup"]
}

def main():
    print(f"Total Countries defined: {len(WORLD_DATA)}")
    empty_countries = [c for c, cities in WORLD_DATA.items() if len(cities) == 0]
    if empty_countries:
        print(f"ERROR: Countries with 0 cities: {empty_countries}")
        return
    total_cities = sum(len(cities) for cities in WORLD_DATA.values())
    print(f"Total Cities across all countries: {total_cities}")
    
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(WORLD_DATA, f, ensure_ascii=False, indent=2)
    print(f"Successfully saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
