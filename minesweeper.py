"""
Démineur — easter egg du portfolio de Kilian Carasco.

Toute la logique du jeu est écrite en Python et tourne directement dans le
navigateur grâce à Pyodide (CPython compilé en WebAssembly).
demineur.js ne fait que l'affichage : il appelle les méthodes de la classe
Demineur et lit l'état du plateau renvoyé en JSON.

Codes des cases renvoyés par etat() :
    "h"  case cachée          "f"  drapeau
    "0".."8"  case ouverte (nombre de mines voisines)
    "m"  mine (affichée en fin de partie)
    "x"  la mine qui a explosé
    "w"  drapeau mal placé (fin de partie)
"""

import json
import random


class Demineur:
    def __init__(self, lignes=9, colonnes=9, mines=10):
        self.lignes = lignes
        self.colonnes = colonnes
        self.nb_mines = mines
        self.mines = set()
        self.ouvertes = set()
        self.drapeaux = set()
        self.statut = "pret"  # pret, en_cours, gagne, perdu
        self.explosion = None

    # ------------------------------------------------------------------
    # Outils
    # ------------------------------------------------------------------
    def voisins(self, l, c):
        for dl in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if (dl or dc) and 0 <= l + dl < self.lignes and 0 <= c + dc < self.colonnes:
                    yield l + dl, c + dc

    def compte(self, l, c):
        return sum((case in self.mines) for case in self.voisins(l, c))

    def _placer_mines(self, l, c):
        # Le premier clic n'explose jamais : la case et ses voisines sont protégées.
        protegees = {(l, c), *self.voisins(l, c)}
        libres = [
            (i, j)
            for i in range(self.lignes)
            for j in range(self.colonnes)
            if (i, j) not in protegees
        ]
        self.mines = set(random.sample(libres, min(self.nb_mines, len(libres))))
        self.statut = "en_cours"

    def _ouvrir(self, l, c):
        # Ouverture en cascade (parcours en profondeur avec une pile).
        pile = [(l, c)]
        while pile:
            case = pile.pop()
            if case in self.ouvertes or case in self.drapeaux:
                continue
            self.ouvertes.add(case)
            if self.compte(*case) == 0:
                pile.extend(v for v in self.voisins(*case) if v not in self.ouvertes)

    def _verifier_victoire(self):
        total = self.lignes * self.colonnes
        if len(self.ouvertes) == total - len(self.mines):
            self.statut = "gagne"
            self.drapeaux = set(self.mines)

    # ------------------------------------------------------------------
    # Actions appelées depuis JavaScript
    # ------------------------------------------------------------------
    def ouvrir(self, l, c):
        if self.statut in ("gagne", "perdu"):
            return self.etat()
        if (l, c) in self.drapeaux or (l, c) in self.ouvertes:
            return self.etat()
        if self.statut == "pret":
            self._placer_mines(l, c)
        if (l, c) in self.mines:
            self.statut = "perdu"
            self.explosion = (l, c)
            return self.etat()
        self._ouvrir(l, c)
        self._verifier_victoire()
        return self.etat()

    def accord(self, l, c):
        """Clic sur un chiffre : ouvre les voisines si assez de drapeaux sont posés."""
        if self.statut != "en_cours" or (l, c) not in self.ouvertes:
            return self.etat()
        voisines = list(self.voisins(l, c))
        if sum(v in self.drapeaux for v in voisines) != self.compte(l, c):
            return self.etat()
        for v in voisines:
            if v in self.drapeaux or v in self.ouvertes:
                continue
            if v in self.mines:
                self.statut = "perdu"
                self.explosion = v
                return self.etat()
            self._ouvrir(*v)
        self._verifier_victoire()
        return self.etat()

    def drapeau(self, l, c):
        if self.statut in ("gagne", "perdu") or (l, c) in self.ouvertes:
            return self.etat()
        self.drapeaux ^= {(l, c)}
        return self.etat()

    def etat(self):
        fin = self.statut in ("gagne", "perdu")
        plateau = []
        for l in range(self.lignes):
            ligne = []
            for c in range(self.colonnes):
                case = (l, c)
                if case in self.ouvertes:
                    ligne.append(str(self.compte(l, c)))
                elif fin and case == self.explosion:
                    ligne.append("x")
                elif fin and case in self.drapeaux and case not in self.mines:
                    ligne.append("w")
                elif case in self.drapeaux:
                    ligne.append("f")
                elif fin and case in self.mines:
                    ligne.append("m")
                else:
                    ligne.append("h")
            plateau.append(ligne)
        return json.dumps({
            "statut": self.statut,
            "restantes": self.nb_mines - len(self.drapeaux),
            "plateau": plateau,
        })


if __name__ == "__main__":
    # Petit mode console, pour lancer le jeu hors du navigateur : python minesweeper.py
    jeu = Demineur()
    symboles = {"h": "#", "f": "F", "m": "*", "x": "X", "w": "!", "0": "."}
    while jeu.statut in ("pret", "en_cours"):
        etat = json.loads(jeu.etat())
        print("\n   " + " ".join(str(c) for c in range(jeu.colonnes)))
        for i, ligne in enumerate(etat["plateau"]):
            print(f"{i}  " + " ".join(symboles.get(v, v) for v in ligne))
        saisie = input("\nligne colonne (ajoute f pour un drapeau) > ").split()
        try:
            l, c = int(saisie[0]), int(saisie[1])
        except (ValueError, IndexError):
            continue
        jeu.drapeau(l, c) if "f" in saisie[2:] else jeu.ouvrir(l, c)
    print("Gagné !" if jeu.statut == "gagne" else "BOUM. Perdu.")
