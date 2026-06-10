// PAUSD-style elective: "Europe Geography", generated from the user's IGC Europe
// study notes (see /Users/.../IGC Europe Document). One unit per country, in the
// notes' order (Caucasus -> Black Sea -> Baltics -> Balkans -> Central & Western
// Europe -> Iberia). Each unit has a Cities lesson and a Physical Geography &
// Regions lesson (plus an extra lesson where the notes break a section out, e.g.
// Greece's island groups, Germany's states, Denmark's islands & Greenland, or
// Switzerland's Liechtenstein profile). Each unit carries that country's cleaned
// study notes as `textbookContext`, so the tutor and the unit assessment teach
// from the actual notes rather than generic knowledge. A cumulative Final Exam
// closes it.
import { EUROPE_NOTES } from './europeGeographyNotes.js';

const COUNTRIES =
  [
    {
      "name": "Armenia",
      "blurb": "The geography of Armenia — its tufa-built cities, volcanic highlands, and historic sites.",
      "lessons": [
        {
          "title": "Cities & Settlements of Armenia",
          "description": "The major cities and urban centers of Armenia — their location, history, and regional role: Yerevan (the Pink City), Gyumri (the Black City), Vanadzor, Vagharshapat (Etchmiadzin), Dilijan, Goris, and the Syunik towns of Kapan and Sisian."
        },
        {
          "title": "Physical Geography & Regions of Armenia",
          "description": "Landforms, rivers, climate zones, and regions of Armenia — including the high volcanic plateaus, the intermontane basins, Lake Sevan and the Sevan-Hrazdan Cascade, Mount Aragats, the Ararat Plain, and the Zangezur Corridor."
        },
        {
          "title": "Historical Sites of Armenia",
          "description": "The landmark historical and religious sites of Armenia — from the Mother See of Holy Etchmiadzin to the Tatev Monastery — and how mountain geography dictated where they were built."
        }
      ]
    },
    {
      "name": "Georgia",
      "blurb": "The geography of Georgia — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Georgia",
          "description": "The major cities and urban centers of Georgia — their location, history, and regional role: Tbilisi, Rustavi, Batumi, Kutaisi, Poti, Gori, Sighnaghi, Mestia."
        },
        {
          "title": "Physical Geography & Regions of Georgia",
          "description": "Landforms, rivers, climate zones, and regions of Georgia — including the Greater Caucasus, the Lesser Caucasus and Javakheti Plateau, the Likhi Range dividing Colchis from Iberia, the deepest caves on Earth (Veryovkina and Krubera), the Rioni and Kura (Mtkvari) rivers, the Enguri Dam, and the strategic gorges."
        }
      ]
    },
    {
      "name": "Azerbaijan",
      "blurb": "The geography of Azerbaijan — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Azerbaijan",
          "description": "The major cities and urban centers of Azerbaijan — their location, history, and regional role: Baku (the City of Winds), Sumqayit, Ganja, Shaki, Lankaran, and Nakhchivan City (the exclave capital)."
        },
        {
          "title": "Physical Geography & Regions of Azerbaijan",
          "description": "Landforms, rivers, climate zones, and regions of Azerbaijan — including the Greater Caucasus, the Lesser Caucasus, the Talysh Mountains, the Kura river lowlands, the Absheron Peninsula, the mud volcanoes, and the Caspian coast."
        }
      ]
    },
    {
      "name": "Turkey",
      "blurb": "The geography of Turkey — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Turkey",
          "description": "The major cities and urban centers of Turkey — their location, history, and regional role: Istanbul (the Bosphorus chokepoint), Ankara, İzmir, Bursa, Antalya, Konya, Gaziantep & Adana, Çanakkale, Diyarbakır, Trabzon, Kayseri, Erzurum."
        },
        {
          "title": "Physical Geography & Regions of Turkey",
          "description": "Landforms, rivers, climate zones, and regions of Turkey — including the Black Sea, Aegean and Mediterranean maritime envelopes; the Euphrates-Tigris headwaters and hydro-politics; the Anatolian Plate and the North Anatolian Fault; the Pontic and Taurus ranges; Cappadocia; Mount Ararat; and endorheic basins like alkaline Lake Van."
        }
      ]
    },
    {
      "name": "Ukraine",
      "blurb": "The geography of Ukraine — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Ukraine",
          "description": "The major cities and urban centers of Ukraine — their location, history, and regional role: Kyiv (the Dnieper divide), Kharkiv, Odesa, Lviv, Dnipro, Zaporizhzhia, Kherson & Mykolaiv, Sevastopol (Crimea), Mariupol."
        },
        {
          "title": "Physical Geography & Regions of Ukraine",
          "description": "Landforms, rivers, climate zones, and regions of Ukraine — including the Dnieper river system and its reservoir cascade, the Dniester, the Ukrainian Shield, the Polesia (Pripet) Marshes, the Carpathians (Hoverla) and the Crimean Mountains, and the steppe of the Donbas."
        }
      ]
    },
    {
      "name": "Belarus",
      "blurb": "The geography of Belarus — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Belarus",
          "description": "The major cities and urban centers of Belarus — their location, history, and regional role: Minsk, Brest, Grodno (Hrodna), Vitebsk (Viciebsk), Gomel (Homyel), Mogilev (Mahilyow)."
        },
        {
          "title": "Physical Geography & Regions of Belarus",
          "description": "Landforms, rivers, climate zones, and regions of Belarus — including the glacial legacy of ridges and moraines, the Polesia marshes and the Pripyat basin, the Belovezhskaya primeval forest, and the Dnieper, Neman and Western Dvina river systems."
        }
      ]
    },
    {
      "name": "Lithuania",
      "blurb": "The geography of Lithuania — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Lithuania",
          "description": "The major cities and urban centers of Lithuania — their location, history, and regional role: Vilnius (the inland capital), Kaunas, Klaipėda, Šiauliai (and the Hill of Crosses), Panevėžys."
        },
        {
          "title": "Physical Geography & Regions of Lithuania",
          "description": "Landforms, rivers, climate zones, and regions of Lithuania — including the glacial blueprint of the Baltic plain, the coastal anomaly of the Curonian Spit and Lagoon, and the Nemunas river artery."
        }
      ]
    },
    {
      "name": "Latvia",
      "blurb": "The geography of Latvia — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Latvia",
          "description": "The major cities and urban centers of Latvia — their location, history, and regional role: Riga, Daugavpils, Liepāja, Ventspils, Jelgava, Jūrmala."
        },
        {
          "title": "Physical Geography & Regions of Latvia",
          "description": "Landforms, rivers, climate zones, and regions of Latvia — including the glacial architecture of the lowlands, the Daugava and Gauja hydrological arteries, the maritime envelope of the Gulf of Riga, and the bogs and biosphere of the Baltic plain."
        }
      ]
    },
    {
      "name": "Estonia",
      "blurb": "The geography of Estonia — its cities, islands, and limestone landscape.",
      "lessons": [
        {
          "title": "Cities & Settlements of Estonia",
          "description": "The major cities and urban centers of Estonia — their location, history, and regional role: Tallinn, Tartu, Narva, Pärnu, Kohtla-Järve, Kuressaare."
        },
        {
          "title": "Physical Geography & Regions of Estonia",
          "description": "Landforms, rivers, climate zones, and regions of Estonia — including the limestone foundation and the Baltic Klint, the islands of Saaremaa and Hiiumaa, the glacial legacy, Lake Peipus, the wetland sponge of Soomaa, and the Kaali meteorite craters."
        }
      ]
    },
    {
      "name": "Finland",
      "blurb": "The geography of Finland — its cities, lakeland, and glacial landscape.",
      "lessons": [
        {
          "title": "Cities & Settlements of Finland",
          "description": "The major cities and urban centers of Finland — their location, history, and regional role: Helsinki, Tampere, Turku, Oulu, Rovaniemi, Lahti, Kuopio, Vaasa."
        },
        {
          "title": "Physical Geography & Regions of Finland",
          "description": "Landforms, rivers, climate zones, and regions of Finland — including the Precambrian structural foundation, the glacial engineering of eskers, the great post-glacial uplift, the hydrological labyrinth of the Saimaa lakeland, and the orography of the north."
        }
      ]
    },
    {
      "name": "Greece",
      "blurb": "The geography of Greece — its cities, island groups, and tectonic landscape.",
      "lessons": [
        {
          "title": "Cities & Settlements of Greece",
          "description": "The major cities and urban centers of Greece — their location, history, and regional role: Athens (the Attic Basin), Thessaloniki, Patras, Heraklion, Larissa, Volos, Rhodes, Ioannina, Chania, Kavala, Alexandroupoli, Corfu (Kerkyra), Chalcis."
        },
        {
          "title": "Island Groups of Greece",
          "description": "The island groups of Greece — the Ionian Islands (the Heptanese), the Cyclades, the Dodecanese, the Saronic Islands, the Sporades, the North Aegean Islands, Crete, and Evia (Euboea)."
        },
        {
          "title": "Physical Geography & Regions of Greece",
          "description": "Landforms, rivers, climate zones, and regions of Greece — including the Hellenic Arc tectonic engine, the Pindus mountain spine, Mount Olympus, the Rhodope massif, Meteora, the Peloponnese, and the regions of the mainland."
        }
      ]
    },
    {
      "name": "Bulgaria",
      "blurb": "The geography of Bulgaria — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Bulgaria",
          "description": "The major cities and urban centers of Bulgaria — their location, history, and regional role: Sofia, Plovdiv, Varna, Burgas, Ruse, Veliko Tarnovo, Stara Zagora, Pleven."
        },
        {
          "title": "Physical Geography & Regions of Bulgaria",
          "description": "Landforms, rivers, climate zones, and regions of Bulgaria — including the Balkan Mountains central backbone, the Danubian northern platform, the alpine south of Rila (Musala), Pirin and the Rhodopes, the Thracian graben, and the Maritsa and Black Sea hydrology."
        }
      ]
    },
    {
      "name": "Romania",
      "blurb": "The geography of Romania — its cities, the Carpathian Arch, and the Danube.",
      "lessons": [
        {
          "title": "Cities & Settlements of Romania",
          "description": "The major cities and urban centers of Romania — their location, history, and regional role: Bucharest (the Wallachian Plain), Cluj-Napoca, Timișoara, Iași, Constanța, Brașov, Craiova & Galați, Sibiu & Oradea."
        },
        {
          "title": "Physical Geography & Regions of Romania",
          "description": "Landforms, rivers, climate zones, and regions of Romania — including the Carpathian Arch (Moldoveanu), the Transylvanian Plateau, the Danube and its delta, unique geological phenomena like the mud volcanoes and the Bucegi Sphinx, and Romania's soils and climate."
        }
      ]
    },
    {
      "name": "Moldova",
      "blurb": "The geography of Moldova — its cities, physical landscape, and regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Moldova",
          "description": "The major cities and urban centers of Moldova — their location, history, and regional role: Chișinău, Tiraspol, Bălți, Bender (Tighina), Cahul, Soroca, Comrat, Orhei."
        },
        {
          "title": "Physical Geography & Regions of Moldova",
          "description": "Landforms, rivers, climate zones, and regions of Moldova — including the relief of plains and hills, the Dniester and Prut hydrological spine, geological curiosities, the famous chernozem soils, and Moldova's narrow Danube access at Giurgiulești."
        }
      ]
    },
    {
      "name": "Hungary",
      "blurb": "The geography of Hungary — its cities, the Pannonian Basin, and the Danube.",
      "lessons": [
        {
          "title": "Cities & Settlements of Hungary",
          "description": "The major cities and urban centers of Hungary — their location, history, and regional role: Budapest (Buda vs. Pest and the Danube Bend), Debrecen, Szeged, Miskolc, Pécs, Győr, and the historical anchors Eger, Székesfehérvár and Esztergom."
        },
        {
          "title": "Physical Geography & Regions of Hungary",
          "description": "Landforms, rivers, climate zones, and regions of Hungary — including the Pannonian Basin tectonic engine, Lake Balaton, the mountain backbone of Transdanubia and the north (Kékes), and the Danube-Tisza hydrological axis."
        }
      ]
    },
    {
      "name": "Slovakia",
      "blurb": "The geography of Slovakia — its cities, the Carpathian spine, and the Váh.",
      "lessons": [
        {
          "title": "Cities & Settlements of Slovakia",
          "description": "The major cities and urban centers of Slovakia — their location, history, and regional role: Bratislava, Košice, Žilina, Banská Bystrica, Poprad (gateway to the High Tatras), Banská Štiavnica, Nitra & Trnava."
        },
        {
          "title": "Physical Geography & Regions of Slovakia",
          "description": "Landforms, rivers, climate zones, and regions of Slovakia — including the Carpathian spine and the High Tatras (Gerlachovský štít), the Váh river corridor, the Danube lowlands, and the Slovak karst."
        }
      ]
    },
    {
      "name": "Czechia",
      "blurb": "The geography of Czechia — its cities, the Bohemian Massif, and the European divide.",
      "lessons": [
        {
          "title": "Cities & Settlements of Czechia",
          "description": "The major cities and urban centers of Czechia — their location, history, and regional role: Prague (Praha), Brno, Ostrava, Plzeň (Pilsen), Liberec, Olomouc, Karlovy Vary (Carlsbad), České Budějovice."
        },
        {
          "title": "Physical Geography & Regions of Czechia",
          "description": "Landforms, rivers, climate zones, and regions of Czechia — including the Bohemian Massif tectonic engine, the Vltava and Elbe headwaters, the Sudeten mountain wall (Sněžka), the Šumava, the Moravian karst underworld, the South Bohemian lakeland, and the triple European drainage divide sending waters to the North, Baltic and Black Seas."
        }
      ]
    },
    {
      "name": "Poland",
      "blurb": "The geography of Poland — its cities, historic regions, and glacial plains.",
      "lessons": [
        {
          "title": "Cities & Settlements of Poland",
          "description": "The major cities and urban centers of Poland — their location, history, and regional role: Warsaw (Warszawa), Kraków, Gdańsk (the Tricity), Wrocław, Poznań, Łódź."
        },
        {
          "title": "Historic Regions of Poland",
          "description": "The historic regions of Poland and their identities — Pomerania (Pomorze), Masuria (Mazury), Podlachia (Podlasie) and Białowieża, Mazovia (Mazowsze), Greater Poland (Wielkopolska), Silesia (Śląsk), Lesser Poland (Małopolska), and the Carpathian frontier."
        },
        {
          "title": "Physical Geography & Regions of Poland",
          "description": "Landforms, rivers, climate zones, and regions of Poland — including the Baltic littoral and the Hel Peninsula, the moraine belt and Masurian lakeland, the central lowlands, the Vistula and Oder hydrological engine, and the southern mountain wall up to Rysy."
        }
      ]
    },
    {
      "name": "Sweden",
      "blurb": "The geography of Sweden — its cities, archipelagos, and the Scandes.",
      "lessons": [
        {
          "title": "Cities & Settlements of Sweden",
          "description": "The major cities and urban centers of Sweden — their location, history, and regional role: Stockholm, Gothenburg (Göteborg), Malmö, Uppsala, Kiruna (the Arctic mining town), Norrköping."
        },
        {
          "title": "Physical Geography & Regions of Sweden",
          "description": "Landforms, islands, climate zones, and regions of Sweden — including the Stockholm Archipelago, the Baltic islands of Gotland and Öland, the Bohuslän west coast, the Scandes and Kebnekaise, the great lakes Vänern and Vättern, Norrland's iron belt, and the right of public access (Allemansrätten)."
        }
      ]
    },
    {
      "name": "Albania",
      "blurb": "The geography of Albania — its cities, mountain walls, and wild rivers.",
      "lessons": [
        {
          "title": "Cities & Settlements of Albania",
          "description": "The major cities and urban centers of Albania — their location, history, and regional role: Tirana, Durrës, Shkodër, Vlorë, Berat (the City of a Thousand Windows), Gjirokastër (the City of Stone), Korçë."
        },
        {
          "title": "Physical Geography & Regions of Albania",
          "description": "Landforms, rivers, climate zones, and regions of Albania — including the northern wall of the Accursed Mountains (Prokletije), the tectonic lake chain of Ohrid and Prespa, the violent Drin and Vjosa rivers, the Adriatic coastal lowlands, and the Ceraunian Mountains where the Adriatic meets the Ionian."
        }
      ]
    },
    {
      "name": "North Macedonia",
      "blurb": "The geography of North Macedonia — its cities, the Vardar Rift, and tectonic lakes.",
      "lessons": [
        {
          "title": "Cities & Settlements of North Macedonia",
          "description": "The major cities and urban centers of North Macedonia — their location, history, and regional role: Skopje (the Vardar trench), Ohrid, Bitola, Tetovo, Veles, Prilep."
        },
        {
          "title": "Physical Geography & Regions of North Macedonia",
          "description": "Landforms, rivers, climate zones, and regions of North Macedonia — including the Vardar Rift central spine, the western alpine frontier (the Šar Mountains and Korab), the eastern ancient massifs, the Pelagonia breadbasket, and the tectonic lakes Ohrid and Prespa, the 'Galapagos of the Balkans'."
        }
      ]
    },
    {
      "name": "Kosovo",
      "blurb": "The geography of Kosovo — its cities, twin basins, and triple divide.",
      "lessons": [
        {
          "title": "Cities & Settlements of Kosovo",
          "description": "The major cities and urban centers of Kosovo — their location, history, and regional role: Pristina (Prishtina), Prizren, Peja (Peć), Gjakova, Mitrovica."
        },
        {
          "title": "Physical Geography & Regions of Kosovo",
          "description": "Landforms, rivers, climate zones, and regions of Kosovo — including the twin basins of Kosovo and Metohija, the western wall of the Accursed Mountains, the Šar Mountains southern frontier, and the hydrological miracle of a triple drainage divide feeding the Black, Adriatic and Aegean Seas."
        }
      ]
    },
    {
      "name": "Montenegro",
      "blurb": "The geography of Montenegro — its cities, karst, and grand canyons.",
      "lessons": [
        {
          "title": "Cities & Settlements of Montenegro",
          "description": "The major cities and urban centers of Montenegro — their location, history, and regional role: Podgorica, Cetinje (the royal capital), Kotor, Budva, Bar, Nikšić, Žabljak."
        },
        {
          "title": "Physical Geography & Regions of Montenegro",
          "description": "Landforms, rivers, climate zones, and regions of Montenegro — including the karst plateau 'stone sea', the ria coastline of the Bay of Kotor, the northern glaciated alps of Durmitor and Prokletije, the grand canyons of the Tara, and the tectonic depressions of Lake Skadar and the Zeta plain."
        }
      ]
    },
    {
      "name": "Serbia",
      "blurb": "The geography of Serbia — its cities, the Danube, and the Morava corridor.",
      "lessons": [
        {
          "title": "Cities & Settlements of Serbia",
          "description": "The major cities and urban centers of Serbia — their location, history, and regional role: Belgrade (Beograd), Novi Sad, Niš, Kragujevac, Subotica, Novi Pazar."
        },
        {
          "title": "Physical Geography & Regions of Serbia",
          "description": "Landforms, rivers, climate zones, and regions of Serbia — including the Pannonian north (Vojvodina), the Danube's hydrological cleaver and the Iron Gates (Đerdap), the Šumadija central heart, the Morava corridor, the western frontier, and the southern and eastern massifs (Kopaonik)."
        }
      ]
    },
    {
      "name": "Bosnia and Herzegovina",
      "blurb": "The geography of Bosnia and Herzegovina — its cities and the alpine-karst divide.",
      "lessons": [
        {
          "title": "Cities & Settlements of Bosnia and Herzegovina",
          "description": "The major cities and urban centers of Bosnia and Herzegovina — their location, history, and regional role: Sarajevo, Mostar, Banja Luka, Tuzla, Bihać, Zenica, Trebinje."
        },
        {
          "title": "Physical Geography & Regions of Bosnia and Herzegovina",
          "description": "Landforms, rivers, climate zones, and regions of Bosnia and Herzegovina — including the great divide between alpine Dinaric Bosnia and karst Herzegovina, the northern Sava lowlands, the Neretva, and the southern Mediterranean karst with its subterranean rivers and poljes."
        }
      ]
    },
    {
      "name": "Croatia",
      "blurb": "The geography of Croatia — its cities, the Adriatic coast, and its regions.",
      "lessons": [
        {
          "title": "Cities & Settlements of Croatia",
          "description": "The major cities and urban centers of Croatia — their location, history, and regional role: Zagreb, Split, Dubrovnik, Rijeka, Zadar, Pula, Osijek."
        },
        {
          "title": "Physical Geography & Regions of Croatia",
          "description": "Landforms, rivers, climate zones, and regions of Croatia — including the continental east (Slavonia), the mountainous hinge of Lika and Gorski Kotar with the Plitvice Lakes, the Dalmatian coast and its islands, and the Istrian peninsula."
        }
      ]
    },
    {
      "name": "Slovenia",
      "blurb": "The geography of Slovenia — its cities, the Julian Alps, and the original Karst.",
      "lessons": [
        {
          "title": "Cities & Settlements of Slovenia",
          "description": "The major cities and urban centers of Slovenia — their location, history, and regional role: Ljubljana, Maribor, Celje, Koper, Kranj, Novo Mesto, Piran."
        },
        {
          "title": "Physical Geography & Regions of Slovenia",
          "description": "Landforms, rivers, climate zones, and regions of Slovenia — including the alpine northwest (the Julian Alps and Triglav), the Soča valley, the original Karst plateau that named all karst landscapes, the Pannonian northeast, the Dinaric interior, and the short Adriatic littoral."
        }
      ]
    },
    {
      "name": "Austria",
      "blurb": "The geography of Austria — its cities, nine states, and three-layered geology.",
      "lessons": [
        {
          "title": "Cities & Settlements of Austria",
          "description": "The major cities and urban centers of Austria — their location, history, and regional role: Vienna (Wien), Salzburg, Innsbruck, Graz, Linz, Klagenfurt and Villach."
        },
        {
          "title": "Physical Geography & Regions of Austria",
          "description": "The nine federal states and three-layered geology of Austria — the Bohemian Massif granite, the Danube Valley, and the Alps — from the Vienna Basin to the Hohe Tauern and the Großglockner, with Lake Neusiedl and the Pannonian east, and each state's capital and economic niche."
        }
      ]
    },
    {
      "name": "Germany",
      "blurb": "The geography of Germany — its cities, federal states, and great rivers.",
      "lessons": [
        {
          "title": "Cities & Settlements of Germany",
          "description": "The major cities and urban centers of Germany — their location, history, and regional role: Berlin, Hamburg, Munich (München), Frankfurt am Main, Cologne (Köln), Stuttgart, Düsseldorf, the Ruhr metropolis (Essen & Dortmund), Leipzig, Dresden, Nuremberg (Nürnberg), Bremen."
        },
        {
          "title": "States & Regions of Germany",
          "description": "The federal states (Länder) of Germany — from Baden-Württemberg and Bavaria to Mecklenburg-Vorpommern, North Rhine-Westphalia, and the city-states of Berlin, Hamburg and Bremen — each with its capital, landscape, and economic role."
        },
        {
          "title": "Physical Geography & Rivers of Germany",
          "description": "Landforms, rivers, and climate zones of Germany — including the North German Plain, the central uplands and the Black Forest, the Bavarian Alps and the Zugspitze, and the great river systems of the Rhine, Elbe and Danube."
        }
      ]
    },
    {
      "name": "Denmark",
      "blurb": "The geography of Denmark — its cities, islands, and the North Atlantic realm.",
      "lessons": [
        {
          "title": "Cities & Settlements of Denmark",
          "description": "The major cities and urban centers of Denmark — their location, history, and regional role: Copenhagen (København), Aarhus, Odense, Aalborg, Esbjerg, Roskilde, Billund."
        },
        {
          "title": "Islands & the Danish Realm",
          "description": "The islands of Denmark — Zealand (Sjælland), Funen (Fyn), the North Jutlandic Island, Bornholm, Lolland & Falster, Møn & Stevns, Samsø — and the North Atlantic realm: the Faroe Islands and Greenland, with Nuuk, Ilulissat, Sisimiut and Kangerlussuaq."
        },
        {
          "title": "Physical Geography & Regions of Denmark",
          "description": "Landforms, climate, and regions of Denmark — including the glacial moraine landscape of the Jutland peninsula, Skagen and the meeting of the seas, and Denmark's strategic position astride the Øresund and the Baltic approaches."
        }
      ]
    },
    {
      "name": "Norway",
      "blurb": "The geography of Norway — its cities, fjords, and Arctic islands.",
      "lessons": [
        {
          "title": "Cities & Settlements of Norway",
          "description": "The major cities and urban centers of Norway — their location, history, and regional role: Oslo, Bergen, Stavanger, Trondheim, Tromsø, Bodø."
        },
        {
          "title": "Physical Geography & Regions of Norway",
          "description": "Landforms, rivers, climate zones, and regions of Norway — including the fjords and the Sognefjord, the Lofoten archipelago, Galdhøpiggen and the Jotunheimen, the Jostedalsbreen glacier, the Glomma river, and Svalbard in the high Arctic."
        }
      ]
    },
    {
      "name": "Italy",
      "blurb": "The geography of Italy — its cities, macro-regions, and the volcanic south.",
      "lessons": [
        {
          "title": "Cities & Settlements of Italy",
          "description": "The major cities and urban centers of Italy — their location, history, and regional role: Rome (Roma), Milan (Milano), Venice (Venezia), Florence (Firenze), Naples (Napoli), Turin (Torino), Genoa (Genova), Bologna, Palermo, Verona, Bari, L'Aquila."
        },
        {
          "title": "Regions of Italy",
          "description": "The macro-regions of Italy — the industrial Northwest and the Alps, the Adriatic Northeast and the Dolomites, the Apennine Center, the Mediterranean South, and the insular strongholds of Sicily and Sardinia — plus the special autonomous case of the Aosta Valley."
        },
        {
          "title": "Physical Geography & Regions of Italy",
          "description": "Landforms, rivers, climate zones, and regions of Italy — including the Alpine wall, the Apennine spine, the Po Valley, the volcanic arc of the restless south (Vesuvius and Etna), the glacial and volcanic lakes, and the major rivers."
        }
      ]
    },
    {
      "name": "Switzerland",
      "blurb": "The geography of Switzerland — its cities, alpine watersheds, and Liechtenstein.",
      "lessons": [
        {
          "title": "Cities & Settlements of Switzerland",
          "description": "The major cities and urban centers of Switzerland — their location, history, and regional role: Zurich (Zürich), Geneva (Genève), Basel, Bern, Lausanne, Lucerne (Luzern)."
        },
        {
          "title": "Physical Geography & Regions of Switzerland",
          "description": "Landforms, rivers, climate zones, and regions of Switzerland — including the Alps (the Matterhorn and the Aletsch glacier), the Mittelland plateau, the Jura, and the four great river basins draining to four seas: the Rhine, the Rhône, the Ticino (Po) and the Inn (Danube)."
        },
        {
          "title": "Liechtenstein",
          "description": "The Principality of Liechtenstein — the double-landlocked alpine microstate on the Rhine between Switzerland and Austria: Vaduz, the Rhine valley, and its economic profile."
        }
      ]
    },
    {
      "name": "Luxembourg",
      "blurb": "The geography of Luxembourg — its cities and the Éislek-Gutland divide.",
      "lessons": [
        {
          "title": "Cities & Settlements of Luxembourg",
          "description": "The major cities and urban centers of Luxembourg — their location, history, and regional role: Luxembourg City, Esch-sur-Alzette (the red earth south), Echternach, Vianden."
        },
        {
          "title": "Physical Geography & Regions of Luxembourg",
          "description": "Landforms, rivers, climate zones, and regions of Luxembourg — including the divide between the Éislek (the northern Ardennes) and the Gutland, the red earth iron country of the south, and the Moselle valley."
        }
      ]
    },
    {
      "name": "Belgium",
      "blurb": "The geography of Belgium — its cities, river systems, and the Ardennes.",
      "lessons": [
        {
          "title": "Cities & Settlements of Belgium",
          "description": "The major cities and urban centers of Belgium — their location, history, and regional role: Brussels (Bruxelles/Brussel), Antwerp (Antwerpen), Ghent (Gent), Liège (Luik), Bruges (Brugge)."
        },
        {
          "title": "Physical Geography & Regions of Belgium",
          "description": "Landforms, rivers, climate zones, and regions of Belgium — including the Flemish lowlands, the central plateaus on the Brabant Massif, the Ardennes massif and the Signal de Botrange, and the Scheldt and Meuse river systems."
        }
      ]
    },
    {
      "name": "Netherlands",
      "blurb": "The geography of the Netherlands — its cities, provinces, and the war with the sea.",
      "lessons": [
        {
          "title": "Cities & Settlements of the Netherlands",
          "description": "The major cities and urban centers of the Netherlands — their location, history, and regional role: Amsterdam, Rotterdam, The Hague (Den Haag), Utrecht, Eindhoven, Groningen, Maastricht."
        },
        {
          "title": "Provinces of the Netherlands",
          "description": "The provinces of the Netherlands — their capitals, landscapes, and identities, from the northern provinces to South Limburg and the Vaalserberg."
        },
        {
          "title": "Physical Geography & Regions of the Netherlands",
          "description": "Landforms, rivers, climate zones, and regions of the Netherlands — including the low-lying polder landscape and the battle against the sea: the Wadden Sea, the Delta Works and the Maeslantkering, the great rivers, and the hills of South Limburg."
        }
      ]
    },
    {
      "name": "France",
      "blurb": "The geography of France — its cities, regions, and overseas territories.",
      "lessons": [
        {
          "title": "Cities & Settlements of France",
          "description": "The major cities and urban centers of France — their location, history, and regional role: Paris, Lyon, Marseille, Toulouse, Strasbourg, Bordeaux, Lille, Nantes, Rennes, Montpellier, Rouen, Dijon, and the naval stronghold of Cherbourg."
        },
        {
          "title": "Overseas France & Administrative Regions",
          "description": "Overseas France and the administrative regions — the overseas cities and territories of the French Republic, the regions of metropolitan France, and French demographics."
        },
        {
          "title": "Physical Geography & Regions of France",
          "description": "Landforms, rivers, climate zones, and regions of France — including the geological orogeny of the Hexagon, the Alps (Mont Blanc), the Pyrenees, the Massif Central, Corsica, and the great river systems: the Loire, the Seine, the Rhône, the Garonne and the Rhine."
        }
      ]
    },
    {
      "name": "Andorra",
      "blurb": "The geography of Andorra — the Pyrenean microstate of glacial valleys.",
      "lessons": [
        {
          "title": "Cities & Settlements of Andorra",
          "description": "The settlements of Andorra — Andorra la Vella, the highest capital city in Europe, and the towns of the Y-shaped valley system."
        },
        {
          "title": "Physical Geography & Regions of Andorra",
          "description": "Landforms, rivers, climate zones, and regions of Andorra — including the Y-shaped glacial valleys, the Valira river system, Coma Pedrosa and the high Pyrenean peaks, and the strategic significance of microstate geography."
        }
      ]
    },
    {
      "name": "Spain",
      "blurb": "The geography of Spain — its cities, autonomous communities, and the Meseta.",
      "lessons": [
        {
          "title": "Cities & Settlements of Spain",
          "description": "The major cities and urban centers of Spain — their location, history, and regional role: Madrid, Barcelona, Valencia, Seville (Sevilla), Bilbao, Zaragoza, Malaga, Las Palmas de Gran Canaria, Ibiza (Eivissa)."
        },
        {
          "title": "Autonomous Communities of Spain",
          "description": "The autonomous communities of Spain — from Andalusia and Catalonia to the Basque Country, Galicia, Castile and León, Madrid, Valencia, the Balearics and the Canaries — their capitals and key sites."
        },
        {
          "title": "Physical Geography & Regions of Spain",
          "description": "Landforms, rivers, climate zones, and regions of Spain — including the Central Meseta heartland, the mountain barriers (the Pyrenees, the Cantabrian range, the Sierra Nevada), the great river basins (Tagus, Ebro, Guadalquivir), coastal morphology, the insular landscapes and Mount Teide, and the climate split between Green Spain, Dry Spain and the continental interior."
        }
      ]
    },
    {
      "name": "Portugal",
      "blurb": "The geography of Portugal — its cities and Atlantic archipelagos.",
      "lessons": [
        {
          "title": "Cities & Settlements of Portugal",
          "description": "The major cities and urban centers of Portugal — their location, history, and regional role: Lisbon (Lisboa), Porto, Coimbra, Braga, Faro (gateway to the Algarve), Évora, Aveiro (the Portuguese Venice)."
        },
        {
          "title": "The Atlantic Archipelagos: Azores & Madeira",
          "description": "Portugal's Atlantic island regions — the Azores (Ponta Delgada, Angra do Heroísmo, Horta and the triple-plate Azores Plateau) and Madeira (Funchal, Santa Cruz) — their volcanic geography and strategic role."
        },
        {
          "title": "Physical Geography & Regions of Portugal",
          "description": "Landforms, rivers, climate zones, and regions of Portugal — including the Tagus and Douro rivers, the Serra da Estrela, the Alentejo, and the Algarve coast."
        }
      ]
    }
  ];

const FINAL_EXAM_UNIT = {
  title: 'Final Exam - Comprehensive European Geography',
  description: 'Cumulative final exam across all 40 countries: cities, physical geography, regions, islands, and rivers of the entire continent, organized by region.',
  textbookContext: "EUROPE — CONTINENTAL SYNTHESIS (cumulative final-exam scope)\n\nThis exam is cumulative across every country in the course. Review by region:\n\n- The Caucasus: Armenia, Georgia, Azerbaijan. The Greater and Lesser Caucasus, the Likhi Range, Lake Sevan, Mount Aragats and the Ararat Plain, the Kura (Mtkvari) and Rioni rivers, the Caspian and Black Sea coasts. Cities: Yerevan, Gyumri, Tbilisi, Batumi, Kutaisi, Baku, Ganja.\n- Anatolia and the Black Sea: Turkey, Ukraine. The Bosphorus and Dardanelles, the Anatolian Plate and the North Anatolian Fault, the Pontic and Taurus ranges, the Euphrates-Tigris headwaters, Lake Van; the Dnieper and its reservoir cascade, the Ukrainian Shield, the Polesia Marshes, the Carpathians and the Crimean Mountains. Cities: Istanbul, Ankara, İzmir, Kyiv, Kharkiv, Odesa, Lviv.\n- Eastern Europe and the Baltics: Belarus, Lithuania, Latvia, Estonia. The glacial plains and moraine ridges, the Polesia and Pripyat marshes, the Curonian Spit, the Daugava and Nemunas rivers, the Baltic Klint, the islands of Saaremaa and Hiiumaa, Lake Peipus. Cities: Minsk, Brest, Vilnius, Kaunas, Klaipėda, Riga, Daugavpils, Tallinn, Tartu, Narva.\n- The Nordics: Finland, Sweden, Denmark, Norway. The Precambrian shield, eskers and post-glacial uplift, the Saimaa lakeland; the Scandes, Kebnekaise, lakes Vänern and Vättern, the Stockholm Archipelago, Gotland and Öland; the Jutland moraines, the Danish islands, the Øresund, Greenland and the Faroe Islands; the fjords (Sognefjord), Lofoten, Jotunheimen and Galdhøpiggen, Jostedalsbreen, Svalbard. Cities: Helsinki, Tampere, Stockholm, Gothenburg, Copenhagen, Aarhus, Oslo, Bergen, Trondheim, Tromsø, Nuuk.\n- Southeastern Europe: Greece, Bulgaria, Romania, Moldova. The Hellenic Arc, the Pindus spine, Mount Olympus, the island groups (Ionian, Cyclades, Dodecanese, Sporades, North Aegean, Crete, Evia); the Balkan Mountains, Rila (Musala), Pirin and the Rhodopes, the Maritsa; the Carpathian Arch, the Transylvanian Plateau, the Danube Delta; the Dniester-Prut spine and the chernozem soils. Cities: Athens, Thessaloniki, Sofia, Plovdiv, Varna, Bucharest, Cluj-Napoca, Constanța, Chișinău, Tiraspol.\n- Central Europe: Hungary, Slovakia, Czechia, Poland, Austria, Germany, Switzerland (and Liechtenstein). The Pannonian Basin and Lake Balaton, the Danube-Tisza axis; the High Tatras and the Váh; the Bohemian Massif, the Vltava and Elbe, the Sudetes, the triple drainage divide; the Vistula and Oder, the Masurian lakes, the Baltic littoral; the nine Austrian states, the Hohe Tauern and Großglockner; the German Länder, the North German Plain, the Rhine, Elbe and Danube, the Zugspitze; the Alps, the Mittelland, the Jura, and the four Swiss river basins. Cities: Budapest, Debrecen, Bratislava, Košice, Prague, Brno, Warsaw, Kraków, Gdańsk, Vienna, Salzburg, Berlin, Hamburg, Munich, Frankfurt, Zurich, Geneva, Bern, Vaduz.\n- The Balkans: Albania, North Macedonia, Kosovo, Montenegro, Serbia, Bosnia and Herzegovina, Croatia, Slovenia. The Accursed Mountains (Prokletije), the Šar Mountains, the Dinaric Alps and the karst (poljes, sinking rivers), the Vardar Rift, the tectonic lakes Ohrid, Prespa and Skadar, the Tara canyons and Durmitor, the Iron Gates of the Danube, the Sava and Morava corridors, the Julian Alps and Triglav, the Dalmatian coast and Istria. Cities: Tirana, Durrës, Skopje, Ohrid, Pristina, Prizren, Podgorica, Kotor, Belgrade, Novi Sad, Niš, Sarajevo, Mostar, Zagreb, Split, Dubrovnik, Ljubljana, Maribor.\n- Western Europe: Italy, Luxembourg, Belgium, Netherlands, France. The Alpine wall and the Apennine spine, the Po Valley, the volcanic arc (Vesuvius, Etna), Sicily and Sardinia; the Éislek and Gutland; the Brabant Massif, the Ardennes, the Scheldt and Meuse; the polders, the Wadden Sea, the Delta Works; the Hexagon's orogeny, Mont Blanc, the Pyrenees, the Massif Central, Corsica, and the Loire, Seine, Rhône, Garonne and Rhine, plus Overseas France. Cities: Rome, Milan, Venice, Naples, Luxembourg City, Brussels, Antwerp, Amsterdam, Rotterdam, The Hague, Paris, Lyon, Marseille, Toulouse, Cherbourg.\n- Iberia: Andorra, Spain, Portugal. The Pyrenees and the Valira valleys; the Central Meseta, the Cantabrian range and the Sierra Nevada, the Tagus, Ebro and Guadalquivir basins, the Balearics, the Canaries and Mount Teide, Green vs. Dry Spain; the Douro and Tagus, the Serra da Estrela, the Algarve, the Azores and Madeira. Cities: Andorra la Vella, Madrid, Barcelona, Valencia, Seville, Bilbao, Lisbon, Porto, Coimbra, Funchal, Ponta Delgada.\n\nBe able to: locate each country and its capital; identify the major rivers, mountain systems, lakes, islands, seas and straits; match cities to countries and regions; and explain the regional divisions, tectonic features, and competition-level details covered in the notes.",
  lessons: [
    {
      title: 'Continental Review - Countries, Capitals & Regions',
      description: 'Synthesize the whole course region by region - the Caucasus, Anatolia and the Black Sea, Eastern Europe and the Baltics, the Nordics, Southeastern Europe, Central Europe, the Balkans, Western Europe, and Iberia - matching each country to its capital, major cities, and regional grouping.',
    },
    {
      title: 'Continental Review - Mountains, Rivers, Islands & Seas',
      description: "Cross-country physical geography: the Alps, Carpathians, Caucasus, Pyrenees, Dinarides and Scandes; the Danube, Rhine, Dnieper, Vistula, Loire and Tagus river systems; the great island groups from the Aegean to the Baltic to the North Atlantic; and Europe's seas, straits and drainage divides.",
    },
  ],
};

export const EUROPE_GEOGRAPHY_COURSE = {
  slug: 'europe-geography',
  title: 'Europe Geography',
  description: 'A country-by-country tour of Europe, built from the IGC Europe study notes. All 40 countries from the Caucasus to Iberia get their own unit covering cities, physical geography, regions and islands, capped by a cumulative final exam over the whole continent.',
  subject: 'geography',
  grade: '9-12',
  difficulty: 'advanced',
  textbook: 'IGC Europe Geography study notes',
  units: [
    ...COUNTRIES.map((c) => ({
      title: c.name,
      description: c.blurb,
      textbookContext: EUROPE_NOTES[c.name] || null,
      lessons: c.lessons,
    })),
    FINAL_EXAM_UNIT,
  ],
};
