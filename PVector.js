"use strict";
function invariant(condition, error) {
    if (!condition)
        throw new Error(error);
}

var PVector = (function () {
    // @pragma Construction
    function PVector() {
        var values = [];
        for (var _i = 0; _i < (arguments.length - 0); _i++) {
            values[_i] = arguments[_i + 0];
        }
        return PVector.fromArray(values);
    }
    PVector.empty = function () {
        return __EMPTY_PVECT || (__EMPTY_PVECT = PVector._make(0, 0, SHIFT, __EMPTY_VNODE, []));
    };

    PVector.fromArray = function (values) {
        if (values.length > 0 && values.length < SIZE) {
            return PVector._make(0, values.length, SHIFT, __EMPTY_VNODE, values.slice());
        }

        // TODO: create a TVector and then return a cast to PVector
        var vect = PVector.empty();
        values.forEach(function (value, index) {
            vect = vect.set(index, value);
        });
        return vect;
    };

    PVector.prototype.toArray = function () {
        var array = new Array(this.length);
        this.forEach(function (value, index) {
            array[index] = value;
        });
        return array;
    };

    PVector.prototype.get = function (index) {
        index = rawIndex(index, this._origin);
        if (index < this._size) {
            var array = this._arrayFor(index);
            return array && array[index & MASK];
        }
    };

    PVector.prototype.exists = function (index) {
        index = rawIndex(index, this._origin);
        if (index >= this._size) {
            return false;
        }
        var array = this._arrayFor(index);
        var property = index & MASK;
        return !!array && array.hasOwnProperty(property);
    };

    PVector.prototype.first = function () {
        return this.get(0);
    };

    PVector.prototype.last = function () {
        return this.get(this.length - 1);
    };

    // @pragma Modification
    PVector.prototype.set = function (index, value) {
        index = rawIndex(index, this._origin);
        var tailOffset = getTailOffset(this._size);

        // Overflow's tail, merge the tail and make a new one.
        if (index >= tailOffset + SIZE) {
            // Tail might require creating a higher root.
            var newRoot = this._root;
            var newShift = this._level;
            while (tailOffset > 1 << (newShift + SHIFT)) {
                newRoot = new VNode([newRoot]);
                newShift += SHIFT;
            }
            if (newRoot === this._root) {
                newRoot = newRoot.clone();
            }

            // Merge Tail into tree.
            var node = newRoot;
            for (var level = newShift; level > SHIFT; level -= SHIFT) {
                var subidx = (tailOffset >>> level) & MASK;
                node = node.array[subidx] = node.array[subidx] ? node.array[subidx].clone() : new VNode();
            }
            node.array[(tailOffset >>> SHIFT) & MASK] = new VNode(this._tail);

            // Create new tail with set index.
            var newTail = new Array(SIZE);
            newTail[index & MASK] = value;
            return PVector._make(this._origin, index + 1, newShift, newRoot, newTail);
        }

        // Fits within tail.
        if (index >= tailOffset) {
            var newTail = this._tail.slice();
            newTail[index & MASK] = value;
            var newLength = index >= this._size ? index + 1 : this._size;
            return PVector._make(this._origin, newLength, this._level, this._root, newTail);
        }

        // Fits within existing tree.
        var newRoot = this._root.clone();
        var node = newRoot;
        for (var level = this._level; level > 0; level -= SHIFT) {
            var subidx = (index >>> level) & MASK;
            node = node.array[subidx] = node.array[subidx] ? node.array[subidx].clone() : new VNode();
        }
        node.array[index & MASK] = value;
        return PVector._make(this._origin, this._size, this._level, newRoot, this._tail);
    };

    PVector.prototype.push = function () {
        var values = [];
        for (var _i = 0; _i < (arguments.length - 0); _i++) {
            values[_i] = arguments[_i + 0];
        }
        var vec = this;
        for (var ii = 0; ii < values.length; ii++) {
            vec = vec.set(vec.length, values[ii]);
        }
        return vec;
    };

    PVector.prototype.pop = function () {
        var newSize = this._size - 1;

        if (newSize <= this._origin) {
            return PVector.empty();
        }

        // Fits within tail.
        if (newSize > getTailOffset(this._size)) {
            return PVector._make(this._origin, newSize, this._level, this._root, this._tail.slice(0, -1));
        }

        var newRoot = this._root.pop(this._size, this._level) || __EMPTY_VNODE;
        var newTail = this._arrayFor(newSize - 1);
        return PVector._make(this._origin, newSize, this._level, newRoot, newTail);
    };

    PVector.prototype.remove = function (index) {
        index = rawIndex(index, this._origin);
        var tailOffset = getTailOffset(this._size);

        // Out of bounds, no-op.
        if (!this.exists(index)) {
            return this;
        }

        // Delete within tail.
        if (index >= tailOffset) {
            var newTail = this._tail.slice();
            delete newTail[index & MASK];
            return PVector._make(this._origin, this._size, this._level, this._root, newTail);
        }

        // Fits within existing tree.
        var newRoot = this._root.clone();
        var node = newRoot;
        for (var level = this._level; level > 0; level -= SHIFT) {
            var subidx = (index >>> level) & MASK;
            node = node.array[subidx] = node.array[subidx].clone();
        }
        delete node.array[index & MASK];
        return PVector._make(this._origin, this._size, this._level, newRoot, this._tail);
    };

    PVector.prototype.unshift = function () {
        var values = [];
        for (var _i = 0; _i < (arguments.length - 0); _i++) {
            values[_i] = arguments[_i + 0];
        }
        var newOrigin = this._origin - values.length;
        var newSize = this._size;
        var newLevel = this._level;
        var newRoot = this._root;

        while (newOrigin < 0) {
            var node = new VNode();
            node.array[1] = newRoot;
            newOrigin += 1 << newLevel;
            newSize += 1 << newLevel;
            newLevel += SHIFT;
            newRoot = node;
        }

        if (newRoot === this._root) {
            newRoot = this._root.clone();
        }

        for (var ii = 0; ii < values.length; ii++) {
            var index = newOrigin + ii;
            var node = newRoot;
            for (var level = newLevel; level > 0; level -= SHIFT) {
                var subidx = (index >>> level) & MASK;
                node = node.array[subidx] = node.array[subidx] ? node.array[subidx].clone() : new VNode();
            }
            node.array[index & MASK] = values[ii];
        }

        return PVector._make(newOrigin, newSize, newLevel, newRoot, this._tail);
    };

    PVector.prototype.shift = function () {
        return this.slice(1);
    };

    // @pragma Composition
    PVector.prototype.reverse = function () {
        // This should really only affect how inputs are translated and iteration ordering.
        // This should probably also need to be a lazy sequence to keep the data structure intact.
        invariant(false, 'NYI');
        return null;
    };

    PVector.prototype.concat = function () {
        var vectors = [];
        for (var _i = 0; _i < (arguments.length - 0); _i++) {
            vectors[_i] = arguments[_i + 0];
        }
        var vector = this;
        for (var ii = 0; ii < vectors.length; ii++) {
            if (vectors[ii].length > 0) {
                if (vector.length === 0) {
                    vector = vectors[ii];
                } else {
                    // Clojure implements this as a lazy seq.
                    // Likely because there is no efficient way to do this.
                    // We need to rebuild a new datastructure entirely.
                    // However, if all you wanted to do was iterate over both, or if you wanted
                    //   to put them into a different data structure, lazyseq would help.
                    invariant(false, 'NYI');
                }
            }
        }
        return vector;
    };

    PVector.prototype.slice = function (begin, end) {
        var newOrigin = begin < 0 ? Math.max(this._origin, this._size - begin) : Math.min(this._size, this._origin + begin);
        var newSize = end == null ? this._size : end < 0 ? Math.max(this._origin, this._size - end) : Math.min(this._size, this._origin + end);
        if (newOrigin >= newSize) {
            return PVector.empty();
        }
        var newTail = newSize === this._size ? this._tail : this._arrayFor(newSize) || new Array(SIZE);

        // TODO: should also calculate a new root and garbage collect?
        // This would be a tradeoff between memory footprint and perf.
        // I still expect better performance than Array.slice(), so it's probably worth freeing memory.
        return PVector._make(newOrigin, newSize, this._level, this._root, newTail);
    };

    PVector.prototype.splice = function (index, removeNum) {
        var values = [];
        for (var _i = 0; _i < (arguments.length - 2); _i++) {
            values[_i] = arguments[_i + 2];
        }
        return this.slice(0, index).concat(PVector.fromArray(values), this.slice(index + removeNum));
    };

    // @pragma Iteration
    PVector.prototype.indexOf = function (searchValue) {
        // TODO: this over-iterates.
        var foundIndex = -1;
        this.forEach(function (value, index) {
            if (foundIndex === -1 && value === searchValue) {
                foundIndex = index;
            }
        });
        return foundIndex;
    };

    PVector.prototype.forEach = function (fn, thisArg) {
        this._root.forEach(this._level, -this._origin, fn, thisArg);
        var tailOffset = getTailOffset(this._size) - this._origin;
        this._tail.forEach(function (value, rawIndex) {
            var index = rawIndex + tailOffset;
            index >= 0 && fn.call(thisArg, value, index);
        });
    };

    PVector.prototype.map = function (fn, thisArg) {
        // lazy sequence!
        invariant(false, 'NYI');
        return null;
    };

    PVector._make = function (origin, size, level, root, tail) {
        var vect = Object.create(PVector.prototype);
        vect._origin = origin;
        vect._size = size;
        vect._level = level;
        vect._root = root;
        vect._tail = tail;
        vect.length = size - origin;
        return vect;
    };

    PVector.prototype._arrayFor = function (rawIndex) {
        if (rawIndex >= getTailOffset(this._size)) {
            return this._tail;
        }
        if (rawIndex < 1 << (this._level + SHIFT)) {
            var node = this._root;
            var level = this._level;
            while (node && level > 0) {
                node = node.array[(rawIndex >>> level) & MASK];
                level -= SHIFT;
            }
            return node && node.array;
        }
    };
    return PVector;
})();
exports.PVector = PVector;

function rawIndex(index, origin) {
    invariant(index >= 0, 'Index out of bounds');
    return index + origin;
}

function getTailOffset(size) {
    return size < SIZE ? 0 : (((size - 1) >>> SHIFT) << SHIFT);
}

var VNode = (function () {
    function VNode(array) {
        this.array = array || new Array(SIZE);
    }
    VNode.prototype.clone = function () {
        return new VNode(this.array.slice());
    };

    VNode.prototype.forEach = function (level, offset, fn, thisArg) {
        if (level === 0) {
            this.array.forEach(function (value, rawIndex) {
                var index = rawIndex + offset;
                index >= 0 && fn.call(thisArg, value, index);
            });
        } else {
            var step = 1 << level;
            var newLevel = level - SHIFT;
            this.array.forEach(function (value, index) {
                var newOffset = offset + index * step;
                newOffset + step > 0 && value.forEach(newLevel, newOffset, fn, thisArg);
            });
        }
    };

    VNode.prototype.pop = function (length, level) {
        var subidx = ((length - 1) >>> level) & MASK;
        if (level > SHIFT) {
            var newChild = this.array[subidx].pop(length, level - SHIFT);
            if (newChild || subidx) {
                var node = this.clone();
                if (newChild) {
                    node.array[subidx] = newChild;
                } else {
                    delete node.array[subidx];
                }
                return node;
            }
        } else if (subidx) {
            var newNode = this.clone();
            delete newNode.array[subidx];
            return newNode;
        }
    };
    return VNode;
})();

var SHIFT = 5;
var SIZE = 1 << SHIFT;
var MASK = SIZE - 1;
var __EMPTY_VNODE = new VNode([]);
var __EMPTY_PVECT;
// subvec!
/*
Subvec is a datastructure which wraps a vector and a start and end position.
Wrapping the vector allows it to reuse data and thus be an O(1) operation.
However the side-effect of this is that it holds *all* data the vector holds.
It would be smarter if subvec found only the chunks that it needs to retain.
This is probably an O(log(N)) operation.
Say we have a vector of 16 elements with chunk size 4:
[_ _ _ _]
[_ _ _ _] [_ _ _ _] [_ _ _ _] [_ _ _ _]
If we want [0,2], then we should make a new vector to hold the first chunk only.
Actually, we might take that node and make it the new tail, and leave an empty tree!
If we want [5,10], then we only need to hold the inner two nodes and can release the sides.
Actually, we might take only the first node and then make the second a new tail.
This means some values will still be over retained, but at most SIZE size values.
Access methods simply offset by "start".
Setter methods modify the underlying datastructure and return a new Subvec with the additional start/end applied.
"Shift" is the same as slice(1,0)
"Unshift" is a little trickier, might be as easy as slice(-1), but if the vector index is negative, then a shift is necessary.
This may be done by moving all nodes over one position in the parent, unless the last slot is full, then you go to the parent and continue.
The result of this is that all nodes have been "shifted over" by some power of SIZE. This gives you a new vector with extra space and you can then slice(-1).
*/
//function build_subvec(v, start, end) {
//  while (v instanceof Subvec) {
//    start = v.start + start;
//    end = v.start + end;
//    v = v.v;
//  }
//  var c = v.length;
//  if (start < 0 || end < 0 || start > c || end > c) {
//      throw (new Error("Index out of bounds"));
//  }
//  return new Subvec(v, start, end);
//}
//
//
///**
// * @constructor
// */
//cljs.core.Subvec = (function (v, start, end) {
//    this.v = v;
//    this.start = start;
//    this.end = end;
//});
//cljs.core.Subvec.prototype.cljs$core$ICollection$_conj$arity$2 = (function (coll, o) {
//    var self__ = this;
//    var coll__$1 = this;
//    return cljs.core.build_subvec.call(null, self__.meta, cljs.core._assoc_n.call(null, self__.v, self__.end, o), self__.start, (self__.end + 1), null);
//});
//cljs.core.Subvec.prototype.cljs$core$IReversible$_rseq$arity$1 = (function (coll) {
//    var self__ = this;
//    var coll__$1 = this;
//    if (!((self__.start === self__.end))) {
//        return (new cljs.core.RSeq(coll__$1, ((self__.end - self__.start) - 1), null));
//    } else {
//        return null;
//    }
//});
//cljs.core.Subvec.prototype.cljs$core$ISeqable$_seq$arity$1 = (function (coll) {
//    var self__ = this;
//    var coll__$1 = this;
//    var subvec_seq = ((function (coll__$1) {
//        return (function subvec_seq(i) {
//            if ((i === self__.end)) {
//                return null;
//            } else {
//                return cljs.core.cons.call(null, cljs.core._nth.call(null, self__.v, i), (new cljs.core.LazySeq(null, ((function (coll__$1) {
//                    return (function () {
//                        return subvec_seq.call(null, (i + 1));
//                    });
//                })(coll__$1)), null, null)));
//            }
//        });
//    })(coll__$1));
//    return subvec_seq.call(null, self__.start);
//});
//cljs.core.Subvec.prototype.cljs$core$ICounted$_count$arity$1 = (function (coll) {
//    var self__ = this;
//    var coll__$1 = this;
//    return (self__.end - self__.start);
//});
//cljs.core.Subvec.prototype.cljs$core$IStack$_peek$arity$1 = (function (coll) {
//    var self__ = this;
//    var coll__$1 = this;
//    return cljs.core._nth.call(null, self__.v, (self__.end - 1));
//});
//cljs.core.Subvec.prototype.cljs$core$IStack$_pop$arity$1 = (function (coll) {
//    var self__ = this;
//    var coll__$1 = this;
//    if ((self__.start === self__.end)) {
//        throw (new Error("Can't pop empty vector"));
//    } else {
//        return cljs.core.build_subvec.call(null, self__.meta, self__.v, self__.start, (self__.end - 1), null);
//    }
//});
//cljs.core.Subvec.prototype.cljs$core$IVector$_assoc_n$arity$3 = (function (coll, n, val) {
//    var self__ = this;
//    var coll__$1 = this;
//    var v_pos = (self__.start + n);
//    return cljs.core.build_subvec.call(null, self__.meta, cljs.core.assoc.call(null, self__.v, v_pos, val), self__.start, (function () {
//        var x__3473__auto__ = self__.end;
//        var y__3474__auto__ = (v_pos + 1);
//        return ((x__3473__auto__ > y__3474__auto__) ? x__3473__auto__ : y__3474__auto__);
//    })(), null);
//});
//cljs.core.Subvec.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (coll, other) {
//    var self__ = this;
//    var coll__$1 = this;
//    return cljs.core.equiv_sequential.call(null, coll__$1, other);
//});
//cljs.core.Subvec.prototype.cljs$core$IWithMeta$_with_meta$arity$2 = (function (coll, meta__$1) {
//    var self__ = this;
//    var coll__$1 = this;
//    return cljs.core.build_subvec.call(null, meta__$1, self__.v, self__.start, self__.end, self__.__hash);
//});
//cljs.core.Subvec.prototype.cljs$core$ICloneable$_clone$arity$1 = (function (_) {
//    var self__ = this;
//    var ___$1 = this;
//    return (new cljs.core.Subvec(self__.meta, self__.v, self__.start, self__.end, self__.__hash));
//});
//cljs.core.Subvec.prototype.cljs$core$IMeta$_meta$arity$1 = (function (coll) {
//    var self__ = this;
//    var coll__$1 = this;
//    return self__.meta;
//});
//cljs.core.Subvec.prototype.cljs$core$IIndexed$_nth$arity$2 = (function (coll, n) {
//    var self__ = this;
//    var coll__$1 = this;
//    if (((n < 0)) || ((self__.end <= (self__.start + n)))) {
//        return cljs.core.vector_index_out_of_bounds.call(null, n, (self__.end - self__.start));
//    } else {
//        return cljs.core._nth.call(null, self__.v, (self__.start + n));
//    }
//});
//cljs.core.Subvec.prototype.cljs$core$IIndexed$_nth$arity$3 = (function (coll, n, not_found) {
//    var self__ = this;
//    var coll__$1 = this;
//    if (((n < 0)) || ((self__.end <= (self__.start + n)))) {
//        return not_found;
//    } else {
//        return cljs.core._nth.call(null, self__.v, (self__.start + n), not_found);
//    }
//});
//cljs.core.Subvec.prototype.cljs$core$IEmptyableCollection$_empty$arity$1 = (function (coll) {
//    var self__ = this;
//    var coll__$1 = this;
//    return cljs.core.with_meta.call(null, cljs.core.PersistentVector.EMPTY, self__.meta);
//});
//cljs.core.__GT_Subvec = (function __GT_Subvec(meta, v, start, end, __hash) {
//    return (new cljs.core.Subvec(meta, v, start, end, __hash));
//});
//
