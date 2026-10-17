let _w=self;
function defer(){var e,t,s=new Promise(((s,r)=>{e=s,t=r}));return s.resolve=e,s.reject=t,s.success=e,s.failed=t,s}
function findDeclarations(code, parsed){
    var ast = parsed ? code : esprima.parseScript(code);
    var funcDecls = [];
    var globalVarDecls = [];
    var funcStack = [];
    function visitEachAstNode(root, enter, leave){
        function visit(node){
            function isSubNode(key){
                var child = node[key];
                if (child===null) return false;
                var ty = typeof child;
                if (ty!=='object') return false;
                if (child.constructor===Array) return ( key!=='range' );
                if (key==='loc') return false;
                if ('type' in child){
                    if (child.type in esprima.Syntax) return true;
                    debugger; throw new Error('unexpected');
                } else { return false; }
            }
            enter(node);
            var keys = Object.keys(node);
            var subNodeKeys = keys.filter(isSubNode);
            for (var i=0; i<subNodeKeys.length; i++){
                var key = subNodeKeys[i];
                visit(node[key]);
            }
            leave(node);
        }
        visit(root);
    }
    function myEnter(node){
        if (node.type==='FunctionDeclaration') {
            var current = {
                name      : node.id.name,
                params    : node.params.map(function(p){return p.name;}),
                variables : []
            }
            funcDecls.push(current);
            funcStack.push(current);
        }
        if (node.type==='VariableDeclaration'){
            var foundVarNames = node.declarations.map(function(d){ return {kind: node.kind,name: d.id.name}; });
            if (funcStack.length===0){
                globalVarDecls = globalVarDecls.concat(foundVarNames);
            } else {
                var onTopOfStack = funcStack[funcStack.length-1];
                onTopOfStack.variables = onTopOfStack.variables.concat(foundVarNames);
            }
        }
    }
    function myLeave(node){
        if (node.type==='FunctionDeclaration') {
            funcStack.pop();
        }
    }
    visitEachAstNode(ast, myEnter, myLeave);
    return {
        vars  : globalVarDecls,
        funcs : funcDecls
    };
}

(function () {
'use strict';
    importScripts('https://cdn.jsdelivr.net/npm/esprima@4.0.1/dist/esprima.min.js');
    _w.on('msg', function (e) {
        var code = e.data.code;
        const result = esprima.parseScript(code);
        _w.trigger('msg', {
            "i":e.data.i,
            "code": result,
            "declarations": findDeclarations(result, true)
        });
    });
    return;
})();