"""Tests de la logique du Démineur. Lancement : python -m unittest discover -s tests"""
import json
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from minesweeper import Demineur  # noqa: E402


def etat(jeu_ou_json):
    """Accepte une partie ou la chaîne JSON renvoyée par ses méthodes."""
    texte = jeu_ou_json if isinstance(jeu_ou_json, str) else jeu_ou_json.etat()
    return json.loads(texte)


class TestDemineur(unittest.TestCase):
    def test_premier_clic_jamais_sur_une_mine(self):
        for graine in range(200):
            random.seed(graine)
            jeu = Demineur(9, 9, 10)
            e = etat(jeu.ouvrir(4, 4))
            self.assertNotEqual(e["statut"], "perdu")
            # La case cliquée et ses voisines sont protégées : ouverture en cascade
            self.assertEqual(e["plateau"][4][4], "0")
            self.assertEqual(len(jeu.mines), 10)

    def test_premier_clic_dans_un_coin(self):
        random.seed(1)
        jeu = Demineur(9, 9, 10)
        jeu.ouvrir(0, 0)
        self.assertFalse({(0, 0), (0, 1), (1, 0), (1, 1)} & jeu.mines)

    def test_victoire(self):
        random.seed(3)
        jeu = Demineur(9, 9, 10)
        jeu.ouvrir(4, 4)
        for l in range(9):
            for c in range(9):
                if (l, c) not in jeu.mines:
                    jeu.ouvrir(l, c)
        e = etat(jeu)
        self.assertEqual(e["statut"], "gagne")
        self.assertEqual(e["restantes"], 0)  # drapeaux posés automatiquement

    def test_defaite_et_affichage_des_mines(self):
        random.seed(4)
        jeu = Demineur(9, 9, 10)
        jeu.ouvrir(4, 4)
        mine = next(iter(jeu.mines))
        e = etat(jeu.ouvrir(*mine))
        self.assertEqual(e["statut"], "perdu")
        self.assertEqual(e["plateau"][mine[0]][mine[1]], "x")
        self.assertEqual(sum(row.count("m") for row in e["plateau"]), 9)

    def test_drapeau(self):
        jeu = Demineur(9, 9, 10)
        self.assertEqual(etat(jeu.drapeau(0, 0))["plateau"][0][0], "f")
        self.assertEqual(etat(jeu)["restantes"], 9)
        # On ne peut pas ouvrir une case avec un drapeau
        self.assertEqual(etat(jeu.ouvrir(0, 0))["plateau"][0][0], "f")
        self.assertEqual(etat(jeu.drapeau(0, 0))["plateau"][0][0], "h")

    def test_accord(self):
        random.seed(7)
        jeu = Demineur(9, 9, 10)
        jeu.ouvrir(4, 4)
        # Trouver un chiffre ouvert, poser les bons drapeaux et faire un accord
        for (l, c) in sorted(jeu.ouvertes):
            n = jeu.compte(l, c)
            voisines_fermees = [v for v in jeu.voisins(l, c) if v not in jeu.ouvertes]
            if n and any(v not in jeu.mines for v in voisines_fermees):
                for v in jeu.voisins(l, c):
                    if v in jeu.mines:
                        jeu.drapeau(*v)
                jeu.accord(l, c)
                self.assertTrue(all(v in jeu.ouvertes or v in jeu.mines for v in jeu.voisins(l, c)))
                self.assertNotEqual(jeu.statut, "perdu")
                return
        self.skipTest("aucune configuration d'accord trouvée")

    def test_mauvais_drapeau_en_fin_de_partie(self):
        random.seed(9)
        jeu = Demineur(9, 9, 10)
        jeu.ouvrir(4, 4)
        libre = next((l, c) for l in range(9) for c in range(9) if (l, c) not in jeu.mines and (l, c) not in jeu.ouvertes)
        jeu.drapeau(*libre)
        jeu.ouvrir(*next(iter(jeu.mines)))
        self.assertEqual(etat(jeu)["plateau"][libre[0]][libre[1]], "w")

    def test_niveau_expert(self):
        random.seed(11)
        jeu = Demineur(16, 30, 99)
        jeu.ouvrir(8, 15)
        self.assertEqual(len(jeu.mines), 99)
        self.assertEqual(len(etat(jeu)["plateau"][0]), 30)


if __name__ == "__main__":
    unittest.main()
