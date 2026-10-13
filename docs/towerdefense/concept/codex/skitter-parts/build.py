from pathlib import Path
import sys
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'puppet-tools'))
from build_all import build_species
build_species('skitter')
